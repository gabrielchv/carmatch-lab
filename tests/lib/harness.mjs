/**
 * Test harness for the CarMatch lab.
 *
 * Every test runs against a real Next.js server with an isolated data
 * directory, so a test run can never touch the demo data you seeded for the
 * browser. That isolation is the whole reason this harness exists: `db.ts` and
 * `upload.ts` already honour CARMATCH_DATA_DIR / CARMATCH_UPLOAD_DIR, so a
 * throwaway directory is enough to make the app hermetic.
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm, mkdir, writeFile, readFile, stat, readdir } from "node:fs/promises";
import { createHash, createHmac } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// tests/lib/harness.mjs → lab root is two levels up (tests/, then the lab).
export const LAB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Where each version lives and its identity. */
export const VERSIONS = {
  v1: { dir: "v1", label: "v1 original corrigido" },
  v2: { dir: "v2", label: "v2 Confiança" },
  v3: { dir: "v3", label: "v3 Corrente" },
  v4: { dir: "v4", label: "v4 Avalia" },
  v5: { dir: "v5", label: "v5 Troca Fechada" },
  w1: { dir: "w1", label: "w1 WhatsApp-first" },
  w2: { dir: "w2", label: "w2 Radar" },
  w3: { dir: "w3", label: "w3 Roda" },
  w4: { dir: "w4", label: "w4 Preço" },
  w5: { dir: "w5", label: "w5 Confiança" },
  w6: { dir: "w6", label: "w6 FIPE enxuta" },
};

const DATA_FILES = ["users", "posts", "matches", "conversations", "messages"];

/**
 * The session secret for every test server.
 *
 * Must be >= 16 characters: `lib/auth.ts` refuses anything shorter and falls
 * back to the dev secret (or throws in production), which silently produces a
 * cookie the app will not accept.
 */
export const TEST_SESSION_SECRET = "carmatch-test-secret-0123456789abcdef0123456789";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


/* ─── Production build cache ───────────────────────────────────── */

const BUILD_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".builds");

/** Files that belong to the build, so a change invalidates the cache. */
async function sourceHash(dir) {
  const hash = createHash("sha256");
  const walk = async (rel) => {
    const entries = await readdir(path.join(dir, rel), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (["node_modules", ".next", "data", "public/uploads", ".git"].includes(entry.name)) continue;
      if (entry.name.startsWith(".next.")) continue;
      const next = path.join(rel, entry.name);
      if (entry.isDirectory()) await walk(next);
      else if (entry.isFile()) {
        hash.update(next);
        hash.update(await readFile(path.join(dir, next)));
      }
    }
  };
  await walk(".");
  return hash.digest("hex").slice(0, 16);
}

/**
 * Ensure `<tests>/.builds/<version>` holds a current production build.
 *
 * Rebuilds only when the source hash changes, so a full `--all` run pays the
 * build cost once and later runs start in milliseconds.
 */
export async function ensureBuild(version, { force = false } = {}) {
  const meta = VERSIONS[version];
  if (!meta) throw new Error(`versão desconhecida: ${version}`);

  const source = path.join(LAB, meta.dir);
  const target = path.join(BUILD_ROOT, version);
  const stampFile = path.join(target, ".build-stamp");
  const hash = await sourceHash(source);

  if (!force) {
    try {
      const stamp = await readFile(stampFile, "utf-8");
      await stat(path.join(target, ".next", "BUILD_ID"));
      if (stamp.trim() === hash) return target;
    } catch {
      /* precisa construir */
    }
  }

  // Lock per version: two test files may start at the same time.
  const lock = path.join(BUILD_ROOT, `${version}.lock`);
  await mkdir(BUILD_ROOT, { recursive: true });

  for (let attempt = 0; attempt < 600; attempt++) {
    try {
      await mkdir(lock, { recursive: false });
      break;
    } catch {
      // Someone else is building. Wait for their stamp, then verify.
      await sleep(500);
      try {
        const stamp = await readFile(stampFile, "utf-8");
        if (stamp.trim() === hash) return target;
      } catch {
        /* segue esperando */
      }
      if (attempt === 599) throw new Error(`timeout esperando o build de ${version}`);
    }
  }

  try {
    // Reinicia a árvore: rsync dos fontes + node_modules por hard link.
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });

    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);

    await run("rsync", [
      "-a",
      "--exclude", "node_modules",
      "--exclude", ".next",
      "--exclude", ".next.prod-*",
      "--exclude", "data",
      // Nunca copiar .env.local para um build de teste: ele traz o
      // SESSION_SECRET real, e o servidor passaria a assinar com outra chave.
      "--exclude", ".env",
      "--exclude", ".env.*",
      "--exclude", ".env.local",
      `${source}/`,
      `${target}/`,
    ]);

    // node_modules por hard link: instantâneo e dentro da raiz do projeto
    // (Turbopack recusa um symlink apontando para fora).
    await run("cp", ["-al", path.join(source, "node_modules"), path.join(target, "node_modules")]);

    await run("npx", ["next", "build"], {
      cwd: target,
      env: {
        ...process.env,
        NODE_ENV: "production",
        SESSION_SECRET: TEST_SESSION_SECRET,
      },
      maxBuffer: 64 * 1024 * 1024,
    });

    await writeFile(stampFile, hash, "utf-8");
  } finally {
    await rm(lock, { recursive: true, force: true }).catch(() => {});
  }

  return target;
}

/**
 * Boot one version on its own port with a fresh, empty database.
 *
 * Returns a handle with `base`, `dataDir`, `stop()` and helpers. The caller
 * owns `stop()`; `withServer()` wraps that for you.
 */
export async function startServer(version, opts = {}) {
  /*
   * Retry on EADDRINUSE.
   *
   * Test files run in parallel processes and each picks its own port; two of
   * them occasionally choose the same one. A collision is not a product bug, so
   * it should not fail a suite — try the next port instead.
   */
  const startPort = opts.port ?? 3800;
  let lastError;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await startServerOnPort(version, { ...opts, port: startPort + attempt });
    } catch (err) {
      lastError = err;
      if (!/EADDRINUSE|address already in use/i.test(String(err.message))) throw err;
    }
  }

  throw lastError;
}

async function startServerOnPort(version, { port, seed = null, env = {} } = {}) {
  const meta = VERSIONS[version];
  if (!meta) throw new Error(`versão desconhecida: ${version}`);

  /*
   * Run against a production build, not `next dev`.
   *
   * Two reasons, both learned the hard way:
   *  · Next 16 blocks cross-origin dev requests and refuses a second dev server
   *    per directory, so isolated dev servers are fragile.
   *  · A dev server in a fresh directory served HTML whose client never
   *    hydrated — the page looked alive and did nothing.
   *
   * `next build` once per version, then `next start` per test file: ~300 ms
   * startup, no HMR, no origin rules, and it exercises the artifact that ships.
   */
  const cwd = await ensureBuild(version);

  const dataDir = await mkdtemp(path.join(tmpdir(), `carmatch-${version}-`));
  const uploadDir = path.join(dataDir, "uploads");
  await mkdir(uploadDir, { recursive: true });

  // Start from a known state: empty collections, never the seeded demo data.
  for (const name of DATA_FILES) {
    await writeFile(path.join(dataDir, `${name}.json`), "[]", "utf-8");
  }

  if (seed) await writeFile(path.join(dataDir, "posts.json"), JSON.stringify(seed), "utf-8");

  const child = spawn("npx", ["next", "start", "-p", String(port)], {
    cwd,
    env: {
      ...process.env,
      PORT: String(port),
      // Force the dev-only login path and a stable secret.
      NODE_ENV: "development",
      ALLOW_DEV_LOGIN: "1",
      UNSAFE_ALLOW_DEV_LOGIN: "1",
      DEBUG_TOKEN: "test-debug-token",
      SESSION_SECRET: TEST_SESSION_SECRET,
      CARMATCH_DATA_DIR: dataDir,
      CARMATCH_UPLOAD_DIR: uploadDir,
      // Never inherit a real .env.local: these tests must not touch production
      // credentials or a real Google OAuth app.
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
    // Own process group: `npx next start` spawns a grandchild server, and
    // killing only npx would leave it holding the port.
    detached: true,
  });

  let log = "";
  child.stdout.on("data", (d) => (log += d.toString()));
  child.stderr.on("data", (d) => (log += d.toString()));

  /*
   * `localhost`, never `127.0.0.1`.
   *
   * Next 16 blocks cross-origin requests in dev, and it treats the two as
   * different origins. Using 127.0.0.1 makes the HTML render but silently
   * prevents hydration — the page looks alive and does nothing, which is a
   * miserable thing to debug.
   */
  const base = `http://localhost:${port}`;
  const deadline = Date.now() + 90_000;
  let ready = false;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const res = await fetch(`${base}/api/auth/me`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }

  if (!ready) {
    child.kill("SIGKILL");
    throw new Error(
      `${version} não subiu na porta ${port}.\n--- log ---\n${log.slice(-3000)}`
    );
  }

  const stopServer = async () => {
    const killGroup = (signal) => {
      try {
        process.kill(-child.pid, signal); // grupo inteiro, não só o npx
      } catch {
        try {
          child.kill(signal);
        } catch {
          /* already gone */
        }
      }
    };

    killGroup("SIGTERM");

    // Give Next a moment to release the port, then force it.
    const t = Date.now();
    while (child.exitCode === null && Date.now() - t < 5000) await sleep(100);
    if (child.exitCode === null) killGroup("SIGKILL");
    await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  };

  const stop = stopServer;

  return {
    version,
    label: meta.label,
    base,
    port,
    dataDir,
    uploadDir,
    log: () => log,
    stop,
    readData: async (name) =>
      JSON.parse(await readFile(path.join(dataDir, `${name}.json`), "utf-8")),
    writeData: async (name, value) =>
      writeFile(path.join(dataDir, `${name}.json`), JSON.stringify(value), "utf-8"),
  };
}

/** Run `fn(server)` and always tear the server down. */
export async function withServer(version, opts, fn) {
  if (typeof opts === "function") {
    fn = opts;
    opts = {};
  }
  const server = await startServer(version, opts);
  try {
    return await fn(server);
  } finally {
    await server.stop();
  }
}

/* ─── HTTP client with a cookie jar ────────────────────────────── */

/**
 * Sign a session cookie exactly like `lib/auth.ts` does.
 *
 * The V generation only allows the dev login in a development build, and tests
 * run against a production build. Rather than weaken five apps to suit a test
 * harness, the harness produces the cookie the app would have produced — same
 * payload shape, same HMAC, same secret.
 */
export function signSession({ userId, name }, secret = TEST_SESSION_SECRET) {
  const payload = Buffer.from(JSON.stringify({ userId, name }), "utf-8").toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export class Client {
  constructor(baseOrServer) {
    // Aceita tanto uma URL quanto o handle do servidor, para o login assinado
    // poder gravar o usuário direto no banco de teste.
    if (typeof baseOrServer === "string") {
      this.base = baseOrServer;
      this.server = null;
    } else {
      this.base = baseOrServer.base;
      this.server = baseOrServer;
    }
    this.cookies = new Map();
  }

  headers(extra = {}) {
    const h = { ...extra };
    if (this.cookies.size) {
      h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    return h;
  }

  absorb(res) {
    const list = res.headers.getSetCookie?.() ?? [];
    for (const raw of list) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  async req(pathname, init = {}) {
    const res = await fetch(`${this.base}${pathname}`, {
      ...init,
      headers: this.headers(init.headers),
      redirect: "manual",
    });
    this.absorb(res);
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 400) };
    }
    return { status: res.status, ok: res.ok, body, headers: res.headers, text };
  }

  get(pathname) {
    return this.req(pathname);
  }

  postJson(pathname, value) {
    return this.req(pathname, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    });
  }

  putJson(pathname, value) {
    return this.req(pathname, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    });
  }

  del(pathname) {
    return this.req(pathname, { method: "DELETE" });
  }

  postForm(pathname, form) {
    return this.req(pathname, { method: "POST", body: form });
  }

  putForm(pathname, form) {
    return this.req(pathname, { method: "PUT", body: form });
  }

  /**
   * Log in.
   *
   * Tries the real endpoint first (that is the behaviour worth testing). If the
   * app is a production build of a V version, the dev login is deliberately
   * unavailable — so the harness creates the account in the test database and
   * sets a correctly signed cookie. The app then treats it as a normal session.
   */
  async login({ name, email, whatsapp = "+5511912345678" }) {
    const res = await this.postJson("/api/auth/login", { name, email, whatsapp });
    if (res.status === 200) return res.body.user;

    if (!this.server) {
      throw new Error(`login falhou (${res.status}): ${JSON.stringify(res.body)}`);
    }

    const users = await this.server.readData("users");
    const user = {
      id: `user-${Math.random().toString(36).slice(2, 12)}`,
      name,
      email,
      provider: "email",
      whatsapp,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    await this.server.writeData("users", users);

    this.cookies.set(
      "carmatch-session",
      signSession({ userId: user.id, name: user.name })
    );
    return user;
  }
}

/* ─── Fixtures ─────────────────────────────────────────────────── */

/**
 * Build a CarPost-shaped object.
 *
 * Tests use these instead of seeded data so an assertion never depends on what
 * the FIPE API happened to return. `desired` is a single want; pass `wants` for
 * several.
 */
export function makePost(overrides = {}) {
  const id = overrides.id ?? `post-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id,
    userId: overrides.userId ?? "user-a",
    title: overrides.title ?? `Carro ${id}`,
    description: overrides.description ?? "",
    car: {
      brand: "Honda",
      model: "Fit EX 1.5",
      year: 2015,
      estimatedValue: 50000,
      mileage: 60000,
      color: "Prata",
      localization: "São Paulo - SP",
      ...(overrides.car ?? {}),
    },
    desiredTrade: {
      vehicles: overrides.wants ?? [makeWant()],
      ...(overrides.desiredTrade ?? {}),
    },
    contactInfo: {
      whatsapp: "+5511912345678",
      email: "dono@test.local",
      ...(overrides.contactInfo ?? {}),
    },
    images: overrides.images ?? [],
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00.000Z").toISOString(),
    isActive: overrides.isActive ?? true,
  };
}

export function makeWant(overrides = {}) {
  return {
    brand: "Toyota",
    model: "Corolla",
    cashAdjustment: 0,
    cashAdjustmentTolerance: 1000,
    ...overrides,
  };
}

export function makeUser(overrides = {}) {
  return {
    id: overrides.id ?? `user-${Math.random().toString(36).slice(2, 10)}`,
    name: overrides.name ?? "Pessoa Teste",
    email: overrides.email ?? `${Math.random().toString(36).slice(2, 8)}@test.local`,
    provider: overrides.provider ?? "email",
    whatsapp: overrides.whatsapp ?? "+5511912345678",
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

/** A tiny valid JPEG (1×1 px), enough to pass the magic-byte check. */
export const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64"
);

/** Build multipart form data for POST /api/posts. */
export function postForm({
  title = "Honda Fit 2015",
  brand = "Honda",
  model = "Fit EX 1.5",
  year = 2015,
  value = 50000,
  mileage = 60000,
  color = "Prata",
  city = "São Paulo - SP",
  wants = [makeWant()],
  images = [],
  extra = {},
} = {}) {
  const form = new FormData();
  form.set("title", title);
  form.set("description", "Anúncio de teste");
  form.set("brand", brand);
  form.set("model", model);
  form.set("year", String(year));
  form.set("estimatedValue", String(value));
  form.set("mileage", String(mileage));
  form.set("color", color);
  form.set("localization", city);

  for (const want of wants) {
    form.append("vVehicleType", want.vehicleType ?? "");
    form.append("vBrand", want.brand ?? "");
    form.append("vModel", want.model ?? "");
    form.append("vVersion", want.version ?? "");
    form.append("vTransmission", want.transmission ?? "");
    form.append("vYearMin", want.yearMin ? String(want.yearMin) : "");
    form.append("vYearMax", want.yearMax ? String(want.yearMax) : "");
    form.append("vMileageMin", want.mileageMin ? String(want.mileageMin) : "");
    form.append("vMileageMax", want.mileageMax ? String(want.mileageMax) : "");
    form.append("vCashAdj", String(want.cashAdjustment ?? 0));
    form.append("vTolerance", String(want.cashAdjustmentTolerance ?? 0));
    form.append("vFipeBrandId", want.fipeBrandId ?? "");
    form.append("vFipeVersionCode", want.fipeVersionCode ?? "");
  }

  for (const img of images) {
    form.append("images", new Blob([img.bytes ?? TINY_JPEG], { type: img.type ?? "image/jpeg" }), img.name ?? "foto.jpg");
  }

  for (const [k, v] of Object.entries(extra)) form.set(k, v);

  return form;
}

export { sleep };
