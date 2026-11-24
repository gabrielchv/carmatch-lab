/**
 * Maintenance endpoints and the image route.
 *
 * These are the two places where a mistake is not a broken layout but a broken
 * product: `/api/debug/clear` wipes the database, and `/uploads/*` serves
 * user-supplied bytes.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { useServer } from "../lib/server.mjs";
import { Client, postForm, TINY_JPEG } from "../lib/harness.mjs";

const server = useServer();
const TOKEN = "test-debug-token";

const api = () => new Client(server());

const callDebug = (path, token) =>
  fetch(`${server().base}${path}`, {
    method: "POST",
    headers: token === undefined ? {} : { "x-debug-token": token },
  });

test("debug/clear: sem token → 403", async () => {
  const res = await callDebug("/api/debug/clear");
  assert.equal(res.status, 403);
});

test("debug/clear: token errado → 403", async () => {
  const res = await callDebug("/api/debug/clear", "errado");
  assert.equal(res.status, 403);
});

test("debug/clear: token certo apaga os dados", async () => {
  const user = api();
  await user.login({ name: "Apagar", email: "apagar@test.local" });
  await user.postForm("/api/posts", postForm({ title: "Some" }));

  const antes = await api().get("/api/posts");
  assert.ok(antes.body.total >= 1);

  const res = await callDebug("/api/debug/clear", TOKEN);
  assert.equal(res.status, 200);

  const depois = await api().get("/api/posts");
  assert.equal(depois.body.total, 0, "todos os anúncios foram removidos");

  const users = await server().readData("users");
  assert.equal(users.length, 0, "também os usuários");
});

test("debug/seed: sem token → 403 e nada muda", async () => {
  const antes = await api().get("/api/posts");
  const res = await callDebug("/api/debug/seed");
  assert.equal(res.status, 403);
  const depois = await api().get("/api/posts");
  assert.equal(depois.body.total, antes.body.total);
});

/* ─── /uploads ────────────────────────────────────────────────── */

let uploadedName = null;

test("upload: imagem válida é servida com content-type de imagem", async () => {
  const user = api();
  await user.login({ name: "Foto", email: "foto@test.local" });
  const res = await user.postForm(
    "/api/posts",
    postForm({ title: "Com foto", images: [{ name: "ok.jpg", bytes: TINY_JPEG }] })
  );
  assert.equal(res.status, 201);
  uploadedName = res.body.post.images[0];

  const img = await fetch(`${server().base}/uploads/${uploadedName}`);
  assert.equal(img.status, 200);
  assert.match(img.headers.get("content-type"), /image\/jpeg/);
  assert.equal(img.headers.get("x-content-type-options"), "nosniff");
});

test("upload: extensão que não é imagem → 404", async () => {
  const res = await fetch(`${server().base}/uploads/pacote.json`);
  assert.equal(res.status, 404);
});

test("upload: tentativas de path traversal → nunca 200 de arquivo do projeto", async (t) => {
  const attempts = [
    "../data/users.json",
    "..%2f..%2fdata%2fusers.json",
    "%2e%2e%2f%2e%2e%2fpackage.json",
    "....//....//package.json",
    "%252e%252e%252fpackage.json",
    "/etc/passwd",
    ".env.local",
  ];

  for (const attempt of attempts) {
    await t.test(attempt, async () => {
      const res = await fetch(`${server().base}/uploads/${attempt}`, { redirect: "follow" });
      assert.notEqual(res.status, 500);
      if (res.status === 200) {
        const body = await res.text();
        assert.doesNotMatch(body, /DATABASE_URL|SESSION_SECRET|"dependencies"/, "vazou arquivo interno");
      }
    });
  }
});

test("upload: nome inexistente → 404", async () => {
  const res = await fetch(`${server().base}/uploads/nao-existe.jpg`);
  assert.equal(res.status, 404);
});

/* ─── Matches ─────────────────────────────────────────────────── */

test("matches: lista pública devolve um array", async () => {
  const r = await api().get("/api/matches");
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.matches));
});

test("matches/trigger: exige autenticação", async () => {
  const r = await api().postJson("/api/matches/trigger", {});
  assert.equal(r.status, 401);
});

test("matches: anúncios recíprocos geram match automaticamente", async () => {
  await callDebug("/api/debug/clear", TOKEN);

  const ana = api();
  await ana.login({ name: "Ana", email: "ana@match.local", whatsapp: "+5511911111111" });
  const bruno = api();
  await bruno.login({ name: "Bruno", email: "bruno@match.local", whatsapp: "+5511922222222" });

  // Ana tem um Fit e aceita Corolla; Bruno tem um Corolla e aceita Fit.
  const a = await ana.postForm(
    "/api/posts",
    postForm({
      title: "Fit da Ana",
      brand: "Honda", model: "Fit EX 1.5", year: 2015, value: 50000,
      wants: [{ brand: "Toyota", model: "Corolla", cashAdjustment: 45000, cashAdjustmentTolerance: 3000 }],
    })
  );
  const b = await bruno.postForm(
    "/api/posts",
    postForm({
      title: "Corolla do Bruno",
      brand: "Toyota", model: "Corolla XEi 2.0", year: 2019, value: 95000,
      wants: [{ brand: "Honda", model: "Fit", cashAdjustment: -45000, cashAdjustmentTolerance: 3000 }],
    })
  );

  assert.equal(a.status, 201);
  assert.equal(b.status, 201);

  const matches = await api().get("/api/matches");
  const found = matches.body.matches.find(
    (m) =>
      [m.postAId, m.postBId].includes(a.body.post.id) &&
      [m.postAId, m.postBId].includes(b.body.post.id)
  );
  assert.ok(found, "o par recíproco deveria ter virado match");
  assert.ok(found.score > 0);
});

test("matches: anúncio de mão única não gera match", async () => {
  await callDebug("/api/debug/clear", TOKEN);

  const ana = api();
  await ana.login({ name: "Ana2", email: "ana2@match.local", whatsapp: "+5511911111111" });

  await ana.postForm(
    "/api/posts",
    postForm({
      title: "Só quer Corolla",
      brand: "Honda", model: "Fit EX", year: 2015, value: 50000,
      wants: [{ brand: "Toyota", model: "Corolla", cashAdjustment: 0, cashAdjustmentTolerance: 1000 }],
    })
  );

  const matches = await api().get("/api/matches");
  assert.equal(matches.body.matches.length, 0, "sem reciprocidade não há match");
});

test("posts/[id]/matches: só o dono vê os matches do anúncio", async () => {
  const publico = await api().get("/api/posts/qualquer/matches");
  assert.equal(publico.status, 401, "anônimo não vê matches");

  const dono = api();
  await dono.login({ name: "Dono3", email: "dono3@match.local", whatsapp: "+5511933333333" });
  const criado = await dono.postForm("/api/posts", postForm({ title: "Meu" }));

  const outro = api();
  await outro.login({ name: "Outro", email: "outro3@match.local", whatsapp: "+5511944444444" });
  const alheio = await outro.get(`/api/posts/${criado.body.post.id}/matches`);
  assert.equal(alheio.status, 403);

  const proprio = await dono.get(`/api/posts/${criado.body.post.id}/matches`);
  assert.equal(proprio.status, 200);
});
