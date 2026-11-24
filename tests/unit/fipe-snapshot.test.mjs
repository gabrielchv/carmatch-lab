/**
 * The saved-catalogue fallback.
 *
 * When the free FIPE quota is exhausted, every brand the app has never fetched
 * becomes unusable — which is what the user hit on VW and Ford. The last good
 * copy is kept on disk and served instead, clearly marked as a copy.
 *
 * These tests use a temporary data directory and a failing loader, so the
 * fallback is proven without touching the network or the real data folder.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { LAB } from "../lib/harness.mjs";

const VERSION = process.env.CARMATCH_TEST_VERSION ?? "w1";

const load = async (name) => {
  try {
    return await import(pathToFileURL(path.join(LAB, VERSION, "lib", `${name}.ts`)).href);
  } catch {
    return null;
  }
};

const snapshotMod = await load("fipe-snapshot");
const routeMod = await load("fipe-route");
const available = Boolean(snapshotMod?.readSnapshot && routeMod?.loadCatalogue);
const SKIP = { skip: available ? false : "esta versão não tem o catálogo em disco" };
const t = (name, fn) => test(name, SKIP, fn);

/** Fresh temp data dir per test. */
async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "carmatch-fipe-"));
  const previous = process.env.CARMATCH_DATA_DIR;
  process.env.CARMATCH_DATA_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (previous === undefined) delete process.env.CARMATCH_DATA_DIR;
    else process.env.CARMATCH_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

t("salva e lê de volta o catálogo", async () => {
  await withTempDir(async () => {
    const { writeSnapshot, readSnapshot } = snapshotMod;
    writeSnapshot("models-59", [{ codigo: 1, nome: "Gol" }]);
    const back = readSnapshot("models-59");
    assert.deepEqual(back.data, [{ codigo: 1, nome: "Gol" }]);
    assert.ok(back.fetchedAt, "guarda quando foi capturado");
  });
});

t("sem arquivo, devolve null em vez de estourar", async () => {
  await withTempDir(async () => {
    assert.equal(snapshotMod.readSnapshot("models-123"), null);
  });
});

t("arquivo corrompido não derruba — vira 'sem cópia'", async () => {
  await withTempDir(async (dir) => {
    await mkdir(path.join(dir, "fipe-cache"), { recursive: true });
    await writeFile(path.join(dir, "fipe-cache", "models-1.json"), "{ isso não é json");
    assert.equal(snapshotMod.readSnapshot("models-1"), null);
  });
});

t("chave com caminho é recusada (sem traversal)", async () => {
  await withTempDir(async () => {
    snapshotMod.writeSnapshot("../../etc/passwd", { evil: true });
    assert.equal(snapshotMod.readSnapshot("../../etc/passwd"), null);
  });
});

t("cópia salva é servida quando o upstream cai", async () => {
  await withTempDir(async () => {
    const { loadCatalogue } = routeMod;

    // Primeiro acesso: service no ar, guarda a cópia.
    const live = await loadCatalogue("models-59", async () => [{ codigo: 1, nome: "Gol" }]);
    assert.equal(live.stale, false);

    // Agora a FIPE está fora.
    const offline = await loadCatalogue("models-59", async () => {
      throw new Error("429 limite de taxa");
    });
    assert.equal(offline.stale, true, "deve marcar como cópia, não como atual");
    assert.deepEqual(offline.data, [{ codigo: 1, nome: "Gol" }]);
    assert.ok(offline.fetchedAt);
  });
});

t("sem cópia e com upstream fora, o erro é explícito", async () => {
  await withTempDir(async () => {
    const { loadCatalogue, CatalogueUnavailableError } = routeMod;
    await assert.rejects(
      () =>
        loadCatalogue("models-59", async () => {
          throw new Error("429");
        }),
      (err) => err instanceof CatalogueUnavailableError
    );
  });
});

t("404 não usa cópia: um modelo inexistente não pode ser inventado", async () => {
  await withTempDir(async () => {
    const { writeSnapshot } = snapshotMod;
    const { loadCatalogue } = routeMod;
    const { FipeUnavailableError } = await import(
      pathToFileURL(path.join(LAB, VERSION, "lib", "fipe-api.ts")).href
    );

    writeSnapshot("models-999", [{ codigo: 1, nome: "Não existe" }]);

    await assert.rejects(
      () =>
        loadCatalogue("models-999", async () => {
          throw new FipeUnavailableError("não encontrado", 404);
        }),
      (err) => err.name === "CatalogueUnavailableError"
    );
  });
});

t("cabeçalhos dizem de onde veio o dado", async () => {
  await withTempDir(async () => {
    const { catalogueHeaders } = routeMod;
    assert.equal(catalogueHeaders({ data: [], stale: false })["x-fipe-source"], "live");

    const stale = catalogueHeaders({
      data: [],
      stale: true,
      fetchedAt: "2026-11-20T10:00:00.000Z",
    });
    assert.equal(stale["x-fipe-source"], "snapshot");
    assert.equal(stale["x-fipe-fetched-at"], "2026-11-20T10:00:00.000Z");
  });
});

t("o corpo de indisponível é acionável, não genérico", async () => {
  await withTempDir(async () => {
    const body = routeMod.unavailableBody();
    assert.equal(body.code, "fipe_unavailable");
    assert.equal(body.retryable, true);
    assert.match(body.error, /temporariamente indisponível/i);
    assert.ok(body.hint, "explica o que aconteceu");
  });
});
