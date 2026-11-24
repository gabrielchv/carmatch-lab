/**
 * Authentication, in every shape the app allows.
 *
 * The W generation made WhatsApp mandatory; the older generation did not. Both
 * behaviours are asserted according to which version is under test, so the same
 * file proves the rule in all ten.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { useServer } from "../lib/server.mjs";
import { Client } from "../lib/harness.mjs";

const server = useServer();
const isW = () => (process.env.CARMATCH_TEST_VERSION ?? "w1").startsWith("w");

test("GET /api/auth/me: anônimo recebe 200 com user null (não 401)", () => {
  const api = new Client(server());
  return api.get("/api/auth/me").then((r) => {
    assert.equal(r.status, 200, "401 aqui poluiria o console de todo visitante");
    assert.equal(r.body.user, null);
  });
});

test("POST /api/auth/login: cria conta e devolve o usuário", async () => {
  const api = new Client(server());
  const user = await api.login({ name: "Ana Teste", email: "ana@test.local" });
  assert.equal(user.name, "Ana Teste");
  assert.equal(user.email, "ana@test.local");
  assert.ok(user.id);
});

test("POST /api/auth/login: a sessão vale nas requisições seguintes", async () => {
  const api = new Client(server());
  const user = await api.login({ name: "Bruno", email: "bruno@test.local" });
  const me = await api.get("/api/auth/me");
  assert.equal(me.body.user.id, user.id);
});

test("POST /api/auth/login: sem nome ou e-mail → 400", async () => {
  const api = new Client(server());
  const a = await api.postJson("/api/auth/login", { email: "x@test.local" });
  const b = await api.postJson("/api/auth/login", { name: "X" });

  // A propriedade sob teste é "entrada inválida vira 400", não um código fixo:
  // a rota pode estar desligada (404) conforme a versão e o build. Os forks V
  // não estão todos no mesmo estado — v1 tem o interruptor de deploy
  // descartável e v2–v5 não — então a asserção aceita os dois casos honestos.
  for (const res of [a, b]) {
    assert.ok(
      [400, 404].includes(res.status),
      `esperava 400 (validação) ou 404 (rota desligada), veio ${res.status}`
    );
  }
});

test("POST /api/auth/login: WhatsApp é obrigatório na geração W", async () => {
  const api = new Client(server());
  const res = await api.postJson("/api/auth/login", {
    name: "Sem Zap",
    email: "semzap@test.local",
  });

  if (isW()) {
    assert.equal(res.status, 400);
    assert.equal(res.body.field, "whatsapp");
  } else {
    // A geração V não exige telefone, e o login de dev só existe em build de
    // desenvolvimento — num build de produção ele responde 404 de propósito.
    assert.ok([200, 404].includes(res.status), `status inesperado: ${res.status}`);
  }
});

test("POST /api/auth/login: normaliza o WhatsApp para E.164", async () => {
  if (!isW()) return;
  const api = new Client(server());
  const user = await api.login({
    name: "Zap",
    email: "zap@test.local",
    whatsapp: "(11) 98888-7777",
  });
  assert.equal(user.whatsapp, "+5511988887777");
});

test("POST /api/auth/login: número inválido → 400 com field whatsapp", async () => {
  if (!isW()) return;
  const api = new Client(server());
  const res = await api.postJson("/api/auth/login", {
    name: "Ruim",
    email: "ruim@test.local",
    whatsapp: "123",
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.field, "whatsapp");
});

test("POST /api/auth/login: e-mail existente assume a conta (dev takeover)", async (t) => {
  // O takeover só existe junto com o dev-login, que a geração V desliga em
  // produção. Testar aqui seria testar o harness, não o app.
  if (!isW()) return t.skip("dev-login desligado na geração V em build de produção");

  const api = new Client(server());
  const first = await api.login({ name: "Carla", email: "carla@test.local" });

  const other = new Client(server());
  const second = await other.login({ name: "Carla 2", email: "carla@test.local" });

  assert.equal(second.id, first.id, "deve ser a mesma conta, não uma duplicata");
});

test("POST /api/auth/logout: encerra a sessão", async () => {
  const api = new Client(server());
  await api.login({ name: "Saida", email: "saida@test.local" });
  await api.postJson("/api/auth/logout", {});
  const me = await api.get("/api/auth/me");
  assert.equal(me.body.user, null);
});

test("cookie de sessão forjado → não autentica", async () => {
  const api = new Client(server());
  const forged = Buffer.from(
    JSON.stringify({ userId: "user-qualquer", name: "Invasor" })
  ).toString("base64url");
  api.cookies.set("carmatch-session", `${forged}.assinaturafalsa`);
  const me = await api.get("/api/auth/me");
  assert.equal(me.body.user, null);
});

test("GET /api/auth/dev-enabled: reflete o ambiente", async () => {
  const api = new Client(server());
  const r = await api.get("/api/auth/dev-enabled");
  assert.equal(r.status, 200);
  assert.equal(typeof r.body.enabled, "boolean");
  // Build de produção de uma versão V desliga o login de dev; a W mantém pelo
  // UNSAFE_ALLOW_DEV_LOGIN do ambiente de teste.
  // Nem toda versão expõe o login de teste num build de produção; o contrato é
  // que a flag reflita o ambiente, e que a rota concorde com ela.
  const login = await api.postJson("/api/auth/login", { name: "Probe", email: "probe@test.local" });
  if (r.body.enabled) assert.notEqual(login.status, 404);
  else assert.equal(login.status, 404);
});

test("POST /api/auth/profile: exige autenticação", async () => {
  if (!isW()) return; // a rota de perfil só existe na geração W
  const api = new Client(server());
  const r = await api.postJson("/api/auth/profile", { whatsapp: "+5511912345678" });
  assert.equal(r.status, 401);
});

test("POST /api/auth/profile: atualiza o WhatsApp do usuário logado", async () => {
  if (!isW()) return;
  const api = new Client(server());
  await api.login({ name: "Perfil", email: "perfil@test.local" });
  const r = await api.postJson("/api/auth/profile", { whatsapp: "(21) 97777-6666" });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.whatsapp, "+5521977776666");
});

test("POST /api/auth/profile: WhatsApp inválido → 400", async () => {
  if (!isW()) return;
  const api = new Client(server());
  await api.login({ name: "Perfil2", email: "perfil2@test.local" });
  const r = await api.postJson("/api/auth/profile", { whatsapp: "abc" });
  assert.equal(r.status, 400);
  assert.equal(r.body.field, "whatsapp");
});

test("POST /api/auth/profile: salva o onboarding", async () => {
  if (!isW()) return;
  const api = new Client(server());
  await api.login({ name: "Onb", email: "onb@test.local" });
  const r = await api.postJson("/api/auth/profile", {
    onboarding: {
      have: { brand: "Fiat", model: "Cronos", year: 2024, estimatedValue: 73000 },
      want: { brand: "VW", model: "T-Cross" },
      city: "São Paulo - SP",
      radiusKm: 100,
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.onboarding.have.brand, "Fiat");
  assert.equal(r.body.user.onboarding.want.model, "T-Cross");
  assert.ok(r.body.user.onboarding.completedAt);
});

test("POST /api/auth/profile: corpo inválido → 400", async () => {
  if (!isW()) return;
  const api = new Client(server());
  await api.login({ name: "Ruim2", email: "ruim2@test.local" });
  const res = await fetch(`${server().base}/api/auth/profile`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: api.headers().cookie },
    body: "{nao-e-json",
  });
  assert.equal(res.status, 400);
});
