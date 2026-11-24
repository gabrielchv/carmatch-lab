/**
 * The launcher's command-line contract.
 *
 * `tools/run-all.sh` runs under `set -u`, which turns any unset variable into a
 * fatal error. The main invocation is `./tools/run-all.sh` with no arguments at
 * all, so a bare `$2` crashes the tool the moment someone uses it the obvious
 * way — which is exactly what happened.
 *
 * These tests exercise every argument shape that does not start servers, so the
 * contract stays honest. The command itself is shared by all ten versions, so
 * this suite runs once per test session rather than per version.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { LAB } from "../lib/harness.mjs";

const SCRIPT = path.join(LAB, "tools", "run-all.sh");

/** Run the launcher with a timeout so a bug cannot hang the suite. */
function run(args = []) {
  return spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf-8",
    timeout: 60_000,
    // Keep it away from the real demo ports' side effects where possible.
    env: { ...process.env, PATH: process.env.PATH },
  });
}

test("o script passa a análise de sintaxe do bash", () => {
  const res = spawnSync("bash", ["-n", SCRIPT], { encoding: "utf-8" });
  assert.equal(res.status, 0, res.stderr);
});

test("os posicionais do corpo principal têm default (o caso do $2)", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(SCRIPT, "utf-8");

  assert.match(src, /^set -uo pipefail$/m, "o script usa `set -u`; posicionais precisam de default");

  /*
   * Só o corpo principal importa. Dentro de funções, `"$1"` e `"$2"` são
   * argumentos passados pelo próprio script e sempre existem — sinalizá-los
   * seria ruído. O risco real é o nível de cima, onde o usuário decide quantos
   * argumentos passar.
   */
  const main = src.slice(src.lastIndexOf("\nCMD=") + 1);
  for (const line of main.split("\n")) {
    const bare = line.match(/^[A-Z_]+="\$([1-9])"/);
    if (!bare) continue;
    assert.fail(`posicional sem default no corpo principal: ${line.trim()}`);
  }

  // E os dois que existem precisam mesmo declarar o default.
  assert.match(src, /^CMD="\$\{1:-start\}"$/m);
  assert.match(src, /^GEN_ARG="\$\{2:-\}"$/m);
});

test("`status` sem segundo argumento não quebra (regressão do $2)", () => {
  // Este é o caminho que derrubava o script: o comando vem, a geração não.
  const res = run(["status"]);
  assert.equal(res.status, 0, `stderr: ${res.stderr}\nstdout: ${res.stdout}`);
  assert.doesNotMatch(res.stderr, /unbound variable/);
});

test("`status w` e `status all` aceitam a geração", () => {
  for (const gen of ["v", "w", "all"]) {
    const res = run(["status", gen]);
    assert.equal(res.status, 0, `${gen}: ${res.stderr}`);
  }
});

test("geração inválida sai com código de erro e explica", () => {
  const res = run(["status", "xyz"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /geração inválida/);
});

test("comando inválido mostra o uso e sai com erro", () => {
  const res = run(["foo"]);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /uso:/);
});

test("`logs` sem alvo explica o uso em vez de estourar", () => {
  const res = run(["logs"]);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /uso: .*logs/);
});

test("o banner não imprime placeholder (--all-<gen>)", () => {
  const res = run(["status", "w"]);
  assert.doesNotMatch(res.stdout, /<gen>/);
});

test("sem argumento, a geração padrão é a atual (w), não a antiga (v)", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(SCRIPT, "utf-8");

  // O default precisa ser `w`: é a geração que tem onboarding, WhatsApp e
  // filtro reverso. Apontar para `v` quando alguém digita o comando "no escuro"
  // faz a pessoa procurar features que não existem ali.
  assert.match(
    src,
    /case "\$\{1:-\$\{DEFAULT_GEN:-w\}\}" in/,
    "o default de set_gen deve ser w"
  );
});

test("`status` sem geração não lista as versões antigas", () => {
  const res = run(["status"]);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /w1\b/, "deve listar a geração W");
  assert.doesNotMatch(res.stdout, /v1\b/, "não deve listar a geração V por padrão");
});

test("o banner aponta a URL do onboarding quando a geração tem onboarding", () => {
  const res = run(["status", "w"]);
  assert.match(res.stdout, /onboarding.*localhost:\d+\/boas-vindas/);
});

test("na geração V o banner diz onde o onboarding está, em vez de omiti-lo", () => {
  const res = run(["status", "v"]);
  assert.match(res.stdout, /onboarding: só existe na geração W/);
});
