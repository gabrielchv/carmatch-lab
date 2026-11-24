#!/usr/bin/env node
/**
 * Test runner.
 *
 * Boots one version of CarMatch with an isolated database, then runs the
 * unit/API suites (node:test) against it, followed by the browser suite if a
 * browser is available.
 *
 *   node run.mjs                    # w1, suite completa
 *   node run.mjs --version w3
 *   node run.mjs --all              # as dez versões
 *   node run.mjs --loop             # roda de novo a cada mudança/intervalo
 *   node run.mjs --api-only         # pula o navegador (mais rápido)
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer, VERSIONS, LAB } from "./lib/harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = { version: "w1", all: false, loop: false, apiOnly: false, interval: 20 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") opts.all = true;
    else if (a === "--loop") opts.loop = true;
    else if (a === "--api-only") opts.apiOnly = true;
    else if (a === "--version") opts.version = argv[++i];
    else if (a === "--interval") opts.interval = Number(argv[++i]);
    else if (a === "--help" || a === "-h") {
      console.log(`Uso: node run.mjs [opções]

  --version <vN|wN>  versão alvo (padrão w1)
  --all              todas as dez versões
  --api-only         só unitários e API (sem navegador)
  --loop             repete continuamente
  --interval <s>     segundos entre execuções no modo --loop (padrão 20)`);
      process.exit(0);
    }
  }
  return opts;
}

import { readdir } from "node:fs/promises";

/** Every *.test.mjs inside a suite directory. */
async function filesIn(dir) {
  const entries = await readdir(path.join(HERE, dir));
  return entries
    .filter((f) => f.endsWith(".test.mjs"))
    .sort()
    .map((f) => path.join(dir, f));
}

/** Run a suite with node:test. `tsx` is required to import the TS libraries. */
function runSuite(files, env, extra = []) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--test", "--test-reporter=spec", ...extra, ...files],
      { cwd: HERE, env: { ...process.env, ...env }, stdio: "inherit" }
    );
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

let nextPort = 3710;

async function runVersion(version, opts) {
  const port = nextPort++;
  const started = Date.now();

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${version} · ${VERSIONS[version].label}   (porta ${port})`);
  console.log(`${"═".repeat(70)}\n`);

  let server;
  try {
    server = await startServer(version, { port });
  } catch (err) {
    console.error(`✖ não foi possível subir ${version}: ${err.message}`);
    return { version, ok: false, failed: "boot" };
  }

  const env = {
    CARMATCH_TEST_BASE: server.base,
    CARMATCH_TEST_VERSION: version,
  };

  let unitCode = 1;
  let apiCode = 1;
  let e2eCode = 0;

  try {
    // Unit tests do not need the server, but running them here keeps one
    // command and one report for everything.
    unitCode = await runSuite(await filesIn("unit"), env);
    apiCode = await runSuite(await filesIn("api"), env);

    if (!opts.apiOnly) {
      // Browser tests drive one shared browser; running them one file at a time
      // keeps the report readable and avoids two Chromes competing for CPU.
      e2eCode = await runSuite(await filesIn("e2e"), env, ["--test-concurrency=1"]);
    }
  } finally {
    await server.stop();
  }

  const ok = unitCode === 0 && apiCode === 0 && e2eCode === 0;
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `\n${ok ? "✔" : "✖"} ${version}: unit=${unitCode === 0 ? "ok" : "FALHOU"} ` +
      `api=${apiCode === 0 ? "ok" : "FALHOU"} ` +
      (opts.apiOnly ? "e2e=ignorado" : `e2e=${e2eCode === 0 ? "ok" : "FALHOU"}`) +
      `  (${secs}s)\n`
  );

  return { version, ok, unitCode, apiCode, e2eCode };
}

async function once(opts) {
  // The launcher is shared by every version, so its contract is checked once.
  console.log(`\n${"═".repeat(70)}`);
  console.log("  cli · tools/run-all.sh");
  console.log(`${"═".repeat(70)}\n`);
  const cliCode = await runSuite(await filesIn("cli"), {});

  const versions = opts.all ? Object.keys(VERSIONS) : [opts.version];
  const results = [];
  for (const v of versions) results.push(await runVersion(v, opts));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${"═".repeat(70)}`);
  console.log(
    `  cli=${cliCode === 0 ? "ok" : "FALHOU"} · ` +
      `${results.length - failed.length}/${results.length} versões passaram`
  );
  for (const r of failed) console.log(`    ✖ ${r.version}`);
  console.log(`${"═".repeat(70)}\n`);

  return cliCode === 0 && failed.length === 0;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.loop) {
    process.exit((await once(opts)) ? 0 : 1);
  }

  // Continuous mode: re-run forever. Not a file watcher — a fixed interval is
  // honest about what it does and cannot miss changes between events.
  console.log(`Modo contínuo: a cada ${opts.interval}s. Ctrl+C para parar.`);
  let run = 0;
  for (;;) {
    run++;
    console.log(`\n── execução #${run} · ${new Date().toLocaleTimeString("pt-BR")} ──`);
    await once(opts);
    await new Promise((r) => setTimeout(r, opts.interval * 1000));
  }
}

main();
