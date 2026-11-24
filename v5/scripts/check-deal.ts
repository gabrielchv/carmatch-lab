/**
 * Verificação executável da máquina de estados da Troca Fechada.
 *
 * Roda contra um diretório de dados temporário (CARMATCH_DATA_DIR), então não
 * toca nos dados reais de `data/`. Exercita:
 *   (a) avanço recusado com tarefa obrigatória em aberto;
 *   (b) avanço permitido quando as duas partes concluem a etapa;
 *   (c) histórico cresce, é encadeado e ordenado;
 *   (d) tarefa não pode ser marcada pelo lado errado / por terceiro.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CarPost, DealHistoryEntry, DealStage, User } from "../lib/types";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "carmatch-deal-check-"));
process.env.CARMATCH_DATA_DIR = dataDir;

const FLOW: DealStage[] = [
  "proposta",
  "aceite",
  "vistoria",
  "documentos",
  "contrato",
  "transferencia",
];

async function main() {
  const db = await import("../lib/db");
  const dealLib = await import("../lib/deal");

  console.log("🔎 Troca Fechada — checagem da máquina de estados");
  console.log(`   dados temporários: ${dataDir}\n`);

  const now = new Date().toISOString();

  const userA: User = {
    id: "user-a",
    name: "Ana",
    email: "ana-check@example.com",
    provider: "email",
    createdAt: now,
  };
  const userB: User = {
    id: "user-b",
    name: "Bruno",
    email: "bruno-check@example.com",
    provider: "email",
    createdAt: now,
  };
  const outsider: User = {
    id: "user-c",
    name: "Carla",
    email: "carla-check@example.com",
    provider: "email",
    createdAt: now,
  };

  const postA: CarPost = {
    id: "post-a",
    userId: userA.id,
    title: "Honda Civic EX 2018",
    description: "",
    car: {
      brand: "Honda",
      model: "Civic EX 2.0",
      year: 2018,
      estimatedValue: 92000,
      mileage: 58000,
      localization: "São Paulo - SP",
    },
    desiredTrade: {
      vehicles: [
        {
          brand: "Honda",
          model: "Fit",
          cashAdjustment: -15000,
          cashAdjustmentTolerance: 3000,
        },
      ],
    },
    contactInfo: { email: userA.email },
    images: [],
    createdAt: now,
    isActive: true,
  };

  const postB: CarPost = {
    id: "post-b",
    userId: userB.id,
    title: "Honda Fit LX 2017",
    description: "",
    car: {
      brand: "Honda",
      model: "Fit LX 1.5",
      year: 2017,
      estimatedValue: 77000,
      mileage: 71000,
      localization: "Campinas - SP",
    },
    desiredTrade: {
      vehicles: [
        {
          brand: "Honda",
          model: "Civic",
          cashAdjustment: 15000,
          cashAdjustmentTolerance: 3000,
        },
      ],
    },
    contactInfo: { email: userB.email },
    images: [],
    createdAt: now,
    isActive: true,
  };

  db.writeData("users", [userA, userB, outsider]);
  db.writeData("posts", [postA, postB]);
  db.writeData("deals", []);
  db.writeData("matches", []);

  /* ── criação ─────────────────────────────────────────────────── */

  const created = dealLib.createDealForUser(userA.id, {
    postId: postA.id,
    otherPostId: postB.id,
    cashFromA: -15000,
  });
  if (!created.ok) throw new Error(`criação falhou: ${created.error}`);
  assert.equal(created.created, true);

  const dealId = created.deal.id;
  assert.equal(created.deal.stage, "proposta");
  assert.equal(created.deal.cashFromA, -15000);
  assert.equal(created.deal.history.length, 1, "criação deve abrir o histórico");

  const initial = dealLib.getDealById(dealId);
  assert.ok(initial);
  assert.equal(dealLib.computeProgress(initial), 0);
  console.log("✓ negociação criada em 'proposta' com histórico inicial");

  /* ── (d) lado errado / terceiro / etapa futura ───────────────── */

  const wrongSide = dealLib.setDealTask(
    dealId,
    userB.id,
    "proposta:termos:A",
    true
  );
  if (wrongSide.ok) throw new Error("lado B marcou uma tarefa do lado A");
  assert.equal(wrongSide.status, 403);
  assert.notEqual(
    dealLib.getDealById(dealId)?.taskStates["proposta:termos:A"]?.done,
    true,
    "tarefa não pode ficar marcada após recusa"
  );
  console.log("✓ (d) lado errado não consegue marcar a tarefa (403)");

  const outsiderTask = dealLib.setDealTask(
    dealId,
    outsider.id,
    "proposta:termos:A",
    true
  );
  if (outsiderTask.ok) throw new Error("terceiro marcou uma tarefa");
  assert.equal(outsiderTask.status, 403);

  const outsiderAdvance = dealLib.advanceDeal(dealId, outsider.id);
  if (outsiderAdvance.ok) throw new Error("terceiro avançou a negociação");
  assert.equal(outsiderAdvance.status, 403);
  console.log("✓ terceiro não participa: tarefa e avanço recusados (403)");

  const futureTask = dealLib.setDealTask(
    dealId,
    userA.id,
    "documentos:crlv:A",
    true
  );
  if (futureTask.ok) throw new Error("tarefa de etapa futura foi aceita");
  assert.equal(futureTask.status, 409);
  console.log("✓ tarefa de etapa futura recusada (409)");

  /* ── (a) avanço recusado com tarefas em aberto ───────────────── */

  const refused = dealLib.advanceDeal(dealId, userA.id);
  if (refused.ok) throw new Error("avançou com tarefas obrigatórias abertas");
  assert.equal(refused.status, 409);
  assert.ok(refused.blockers && refused.blockers.length >= 2);
  assert.equal(
    dealLib.getDealById(dealId)?.stage,
    "proposta",
    "etapa não pode mudar numa recusa"
  );
  console.log(
    `✓ (a) avanço recusado com tarefa aberta (409, ${refused.blockers?.length} pendências)`
  );

  // Uma parte sozinha não fecha a etapa: o lado A conclui, o avanço continua 409.
  const stageOne = dealLib.getStageDefinition("proposta");
  assert.ok(stageOne);
  for (const task of stageOne.tasks.filter((t) => t.required && t.side === "A")) {
    const result = dealLib.setDealTask(dealId, userA.id, task.id, true);
    assert.equal(result.ok, true, `falha ao marcar ${task.id}`);
  }

  const halfDone = dealLib.advanceDeal(dealId, userA.id);
  if (halfDone.ok) throw new Error("uma parte sozinha fechou a etapa");
  assert.equal(halfDone.status, 409);
  assert.ok((halfDone.blockers ?? []).every((blocker) => blocker.side === "B"));
  console.log("✓ uma parte sozinha não avança: pendências restantes são do lado B");

  // Desmarcar volta a bloquear; marcar de novo libera (ida e volta).
  const toggleOff = dealLib.setDealTask(
    dealId,
    userA.id,
    "proposta:termos:A",
    false
  );
  assert.equal(toggleOff.ok, true);
  assert.equal(dealLib.getBlockers(dealLib.getDealById(dealId)!).length, 3);
  const toggleOn = dealLib.setDealTask(
    dealId,
    userA.id,
    "proposta:termos:A",
    true
  );
  assert.equal(toggleOn.ok, true);
  console.log("✓ tarefa pode ser desmarcada e o bloqueio volta");

  for (const task of stageOne.tasks.filter((t) => t.required && t.side === "B")) {
    const result = dealLib.setDealTask(dealId, userB.id, task.id, true);
    assert.equal(result.ok, true, `falha ao marcar ${task.id}`);
  }

  const readyForStepOne = dealLib.getDealById(dealId);
  assert.ok(readyForStepOne);
  assert.equal(dealLib.getBlockers(readyForStepOne).length, 0);
  const progressBeforeAdvance = dealLib.computeProgress(readyForStepOne);
  assert.ok(progressBeforeAdvance > 0 && progressBeforeAdvance < 100);

  const historyBefore = readyForStepOne.history.length;
  const advancedOne = dealLib.advanceDeal(dealId, userA.id, "Termos conferidos.");
  if (!advancedOne.ok) throw new Error(`avanço falhou: ${advancedOne.error}`);
  const afterOne = dealLib.getDealById(dealId);
  assert.ok(afterOne);
  assert.equal(afterOne.stage, "aceite");
  assert.equal(afterOne.history.length, historyBefore + 1);
  // O progresso combina etapas concluídas + tarefas da etapa atual; avançar
  // troca a fração da etapa, então o valor se mantém com a etapa recém-aberta.
  assert.equal(dealLib.computeProgress(afterOne), progressBeforeAdvance);
  console.log(
    `✓ (b) avanço permitido com todas as obrigatórias dos dois lados (${progressBeforeAdvance}% na esteira)`
  );

  /* ── percorre o restante da esteira ──────────────────────────── */

  for (let index = 1; index < FLOW.length; index++) {
    const stage = FLOW[index];
    const def = dealLib.getStageDefinition(stage);
    assert.ok(def, `etapa sem definição: ${stage}`);

    const before = dealLib.getDealById(dealId);
    assert.ok(before);
    assert.equal(before.stage, stage);

    // Antes de marcar, o avanço precisa ser recusado nesta etapa.
    const blocked = dealLib.advanceDeal(dealId, userA.id);
    if (blocked.ok) throw new Error(`avançou de ${stage} com tarefas abertas`);
    assert.equal(blocked.status, 409);
    assert.ok((blocked.blockers ?? []).length > 0);

    for (const task of def.tasks.filter((t) => t.required)) {
      const actor = task.side === "A" ? userA : userB;
      const result = dealLib.setDealTask(dealId, actor.id, task.id, true);
      assert.equal(result.ok, true, `falha ao marcar ${task.id}`);
    }

    const ready = dealLib.getDealById(dealId);
    assert.ok(ready);
    assert.equal(dealLib.getBlockers(ready).length, 0);

    // Alterna quem aperta "Avançar etapa": qualquer participante pode.
    const actor = index % 2 === 0 ? userB : userA;
    const expectedNext = index === FLOW.length - 1 ? "concluida" : FLOW[index + 1];
    const advanced = dealLib.advanceDeal(
      dealId,
      actor.id,
      `Etapa ${def.label} conferida.`
    );
    if (!advanced.ok) throw new Error(`avanço falhou em ${stage}: ${advanced.error}`);

    const after = dealLib.getDealById(dealId);
    assert.ok(after);
    assert.equal(after.stage, expectedNext);
    assert.equal(after.history.length, ready.history.length + 1);
  }

  /* ── (c) histórico encadeado, ordenado e imutável ────────────── */

  const finalDeal = dealLib.getDealById(dealId);
  assert.ok(finalDeal);
  assert.equal(finalDeal.stage, "concluida");
  assert.equal(dealLib.computeProgress(finalDeal), 100);
  assert.equal(finalDeal.history.length, FLOW.length + 1);

  assert.equal(finalDeal.history[0].from, null);
  assert.equal(finalDeal.history[0].to, "proposta");

  for (let index = 1; index < finalDeal.history.length; index++) {
    const previous: DealHistoryEntry = finalDeal.history[index - 1];
    const current: DealHistoryEntry = finalDeal.history[index];
    assert.equal(
      current.from,
      previous.to,
      `histórico quebrado no índice ${index}`
    );
    assert.ok(
      new Date(current.at).getTime() >= new Date(previous.at).getTime(),
      `histórico fora de ordem no índice ${index}`
    );
  }
  assert.equal(finalDeal.history[finalDeal.history.length - 1].to, "concluida");
  console.log(
    `✓ (c) histórico com ${finalDeal.history.length} entradas, encadeado e em ordem`
  );

  const afterConclusion = dealLib.advanceDeal(dealId, userA.id);
  if (afterConclusion.ok) throw new Error("avançou depois de concluída");
  assert.equal(afterConclusion.status, 409);

  const cancelAfterConclusion = dealLib.cancelDeal(dealId, userA.id);
  if (cancelAfterConclusion.ok) throw new Error("cancelou uma troca concluída");
  assert.equal(cancelAfterConclusion.status, 409);
  console.log("✓ etapas terminais não voltam atrás (409)");

  /* ── progresso da view e cancelamento ────────────────────────── */

  const viewA = dealLib.getDealViewForUser(dealId, userA.id);
  assert.ok(viewA);
  assert.equal(viewA.progress, 100);
  assert.equal(viewA.isTerminal, true);
  assert.equal(viewA.currentStage, null);
  assert.equal(viewA.history.length, finalDeal.history.length);
  assert.equal(
    dealLib.getDealViewForUser(dealId, outsider.id),
    null,
    "não-participante não recebe a view"
  );

  const cancelled = dealLib.applyCancel(
    {
      ...finalDeal,
      stage: "vistoria",
      history: finalDeal.history.slice(0, 3),
    },
    userB.id,
    "Laudo apontou sinistro grave; negociação encerrada."
  );
  if (!cancelled.ok) throw new Error(cancelled.error);
  assert.equal(cancelled.deal.stage, "cancelada");
  assert.equal(cancelled.deal.cancelReason, "Laudo apontou sinistro grave; negociação encerrada.");
  assert.equal(cancelled.deal.history[cancelled.deal.history.length - 1].to, "cancelada");
  console.log("✓ cancelamento é uma transição registrada no histórico");

  console.log("\n✅ PASS — 4/4 verificações da máquina de estados");
}

main()
  .catch((error) => {
    console.error("\n❌ FAIL —", error);
    process.exitCode = 1;
  })
  .finally(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
