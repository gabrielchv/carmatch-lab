import { addItem, readData, writeData } from "./db";
import { formatBRL } from "./cash";
import { generateId, nowISO } from "./utils";
import type {
  CarPost,
  Deal,
  DealBlocker,
  DealBlockerView,
  DealHistoryEntry,
  DealHistoryView,
  DealSide,
  DealStage,
  DealStageView,
  DealTaskDef,
  DealView,
  Match,
  User,
} from "./types";

/* ─── Esteira de etapas ────────────────────────────────────────── */

export const ACTIVE_STAGES = [
  "proposta",
  "aceite",
  "vistoria",
  "documentos",
  "contrato",
  "transferencia",
] as const;

export type ActiveDealStage = (typeof ACTIVE_STAGES)[number];

/** As sete etapas visíveis no trilho horizontal. `cancelada` fica de fora. */
export const DEAL_STAGES: Array<Exclude<DealStage, "cancelada">> = [
  ...ACTIVE_STAGES,
  "concluida",
];

export const FINAL_STAGE = "concluida" as const;
export const CANCELLED_STAGE = "cancelada" as const;

const STAGE_LABELS: Record<DealStage, string> = {
  proposta: "Proposta",
  aceite: "Aceite",
  vistoria: "Vistoria",
  documentos: "Documentos",
  contrato: "Contrato",
  transferencia: "Transferência",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export interface DealStageDefinition {
  stage: ActiveDealStage;
  label: string;
  summary: string;
  tasks: DealTaskDef[];
}

/**
 * Tarefas são dados, não `if`s espalhados pelo código. Assim a tela, a API e o
 * script de verificação leem exatamente a mesma definição — e incluir uma
 * exigência nova (por exemplo, uma certidão negativa) não muda nenhum guard.
 */
function bothSides(
  stage: string,
  slug: string,
  title: string,
  description: string,
  required = true
): DealTaskDef[] {
  return (["A", "B"] as DealSide[]).map((side) => ({
    id: `${stage}:${slug}:${side}`,
    title,
    description,
    side,
    required,
  }));
}

const STAGE_DEFS: Record<ActiveDealStage, DealStageDefinition> = {
  proposta: {
    stage: "proposta",
    label: STAGE_LABELS.proposta,
    summary:
      "Confirme os termos do match: os dois carros, a diferença em dinheiro e o contato de cada parte.",
    tasks: [
      ...bothSides(
        "proposta",
        "termos",
        "Confirmar os termos do match",
        "Revise os dois carros, a diferença em dinheiro e as condições. Se algo estiver errado, cancele e volte ao anúncio."
      ),
      ...bothSides(
        "proposta",
        "contato",
        "Confirmar dados de contato",
        "Nome, WhatsApp e e-mail atualizados para agendar a vistoria, assinar o contrato e falar com o Detran."
      ),
    ],
  },

  aceite: {
    stage: "aceite",
    label: STAGE_LABELS.aceite,
    summary:
      "As duas partes aceitam formalmente a troca e combinam a vistoria cautelar.",
    tasks: [
      ...bothSides(
        "aceite",
        "proposta",
        "Aceitar a proposta",
        "O aceite registra a data no histórico e fecha os termos: carros, diferença em dinheiro e responsabilidades."
      ),
      ...bothSides(
        "aceite",
        "vistoria",
        "Combinar data e local da vistoria",
        "Escolha uma data e um local de vistoria cautelar que funcionem para as duas partes."
      ),
    ],
  },

  vistoria: {
    stage: "vistoria",
    label: STAGE_LABELS.vistoria,
    summary:
      "Vistoria cautelar dos dois veículos, sem sinistro grave, chassi remarcado ou impedimento.",
    tasks: [
      ...bothSides(
        "vistoria",
        "agendar",
        "Agendar a vistoria do seu carro",
        "Agende a vistoria cautelar do seu veículo e avise a outra parte do horário e do local."
      ),
      ...bothSides(
        "vistoria",
        "laudo",
        "Laudo de vistoria aprovado",
        "Laudo sem sinistro grave, chassi remarcado, impedimento judicial ou divergência entre placa, chassi e motor."
      ),
      ...bothSides(
        "vistoria",
        "fotos",
        "Fotos detalhadas do veículo",
        "Fotos recentes de todos os ângulos, do painel e do número do chassi.",
        false
      ),
    ],
  },

  documentos: {
    stage: "documentos",
    label: STAGE_LABELS.documentos,
    summary:
      "Documentos de cada proprietário e do veículo. É aqui que a maioria das trocas trava.",
    tasks: [
      ...bothSides(
        "documentos",
        "crlv",
        "CRLV digital em dia",
        "CRLV-e (ou CRLV impresso) do seu veículo, com o licenciamento do ano corrente."
      ),
      ...bothSides(
        "documentos",
        "cnh",
        "CNH válida e legível",
        "CNH dentro da validade, sem suspensão ou cassação, com foto e categoria compatíveis."
      ),
      ...bothSides(
        "documentos",
        "residencia",
        "Comprovante de residência",
        "Conta de água, luz ou telefone dos últimos 90 dias, no nome do proprietário."
      ),
      ...bothSides(
        "documentos",
        "ipva",
        "Quitação de IPVA e licenciamento",
        "Comprovante de quitação do IPVA do ano e do licenciamento do veículo."
      ),
      ...bothSides(
        "documentos",
        "multas",
        "Ausência de multas",
        "Consulta de multas e restrições sem pendências em nome do proprietário."
      ),
      ...bothSides(
        "documentos",
        "gravame",
        "Ausência de alienação/gravame",
        "Consulta do Detran comprovando que o veículo não está alienado, penhorado ou dado em garantia."
      ),
    ],
  },

  contrato: {
    stage: "contrato",
    label: STAGE_LABELS.contrato,
    summary:
      "Minuta conferida, diferença registrada e contrato de troca assinado pelas duas partes.",
    tasks: [
      ...bothSides(
        "contrato",
        "minuta",
        "Ler e conferir a minuta do contrato",
        "Minuta com os dois carros, valores, data, responsabilidade por multas e débitos anteriores e cláusula de vistoria."
      ),
      ...bothSides(
        "contrato",
        "pagamento",
        "Registrar a diferença em dinheiro",
        "Comprovante de Pix/TED ou recibo assinado da diferença. Em troca direta, marque como conferido."
      ),
      ...bothSides(
        "contrato",
        "assinar",
        "Assinar o contrato de troca",
        "Duas vias assinadas pelas duas partes, com testemunhas e reconhecimento de firma quando exigido."
      ),
      ...bothSides(
        "contrato",
        "testemunhas",
        "Identificar testemunhas",
        "Nome e CPF de duas testemunhas, se o contrato ou o cartório exigirem.",
        false
      ),
    ],
  },

  transferencia: {
    stage: "transferencia",
    label: STAGE_LABELS.transferencia,
    summary:
      "ATPV-e emitida, taxas pagas e transferência protocolada no Detran para os dois veículos.",
    tasks: [
      ...bothSides(
        "transferencia",
        "atpve",
        "Emitir a ATPV-e",
        "Autorização para Transferência de Propriedade do Veículo (ATPV-e) gerada e assinada no Detran."
      ),
      ...bothSides(
        "transferencia",
        "taxas",
        "Pagar as taxas do Detran",
        "Guia de recolhimento da transferência de propriedade paga para o seu veículo."
      ),
      ...bothSides(
        "transferencia",
        "protocolo",
        "Protocolar a transferência",
        "Protocolo de transferência no Detran do seu estado, com número e data."
      ),
      ...bothSides(
        "transferencia",
        "entrega",
        "Entregar o veículo e as chaves",
        "Carro entregue com chave reserva, manual e acessórios combinados no contrato."
      ),
      ...bothSides(
        "transferencia",
        "vistoria-detran",
        "Vistoria do Detran, quando exigida",
        "Alguns estados exigem vistoria presencial no Detran antes de concluir a transferência.",
        false
      ),
    ],
  },
};

export function isActiveStage(stage: DealStage): stage is ActiveDealStage {
  return (ACTIVE_STAGES as readonly string[]).includes(stage);
}

export function getStageDefinition(
  stage: DealStage
): DealStageDefinition | null {
  return isActiveStage(stage) ? STAGE_DEFS[stage] : null;
}

export function getStageLabel(stage: DealStage): string {
  return STAGE_LABELS[stage];
}

export function getDealSide(deal: Deal, userId: string): DealSide | null {
  if (deal.userAId === userId) return "A";
  if (deal.userBId === userId) return "B";
  return null;
}

export function isTaskDone(deal: Deal, taskId: string): boolean {
  return deal.taskStates[taskId]?.done === true;
}

/**
 * Só as tarefas obrigatórias DA ETAPA ATUAL bloqueiam o avanço.
 *
 * Tarefas de etapas futuras não podem ser marcadas antes da hora: se
 * contassem como pendência agora, o checklist viraria uma lista única e a
 * ordem do processo (vistoria antes de contrato, contrato antes de Detran)
 * deixaria de ser garantida.
 */
export function getBlockers(deal: Deal): DealBlocker[] {
  const def = getStageDefinition(deal.stage);
  if (!def) return [];

  return def.tasks
    .filter((task) => task.required && !isTaskDone(deal, task.id))
    .map((task) => ({
      stage: def.stage,
      taskId: task.id,
      title: task.title,
      side: task.side,
    }));
}

/**
 * Progresso = etapas concluídas + fração de tarefas obrigatórias da etapa
 * atual. Contar todas as tarefas futuras de uma vez faria a barra mostrar 11%
 * logo depois de fechar a primeira etapa, o que lê como processo travado. A
 * esteira é o produto; o progresso precisa refletir a esteira.
 */
function stageProgress(
  deal: Deal,
  stage: Exclude<DealStage, "cancelada">
): number {
  const def = getStageDefinition(stage);
  const index = DEAL_STAGES.indexOf(stage);
  if (!def || index === -1) return 0;

  const required = def.tasks.filter((task) => task.required);
  const done = required.filter((task) => isTaskDone(deal, task.id)).length;
  const ratio = required.length === 0 ? 1 : done / required.length;

  return Math.round(((index + ratio) / DEAL_STAGES.length) * 100);
}

export function computeProgress(deal: Deal): number {
  if (deal.stage === FINAL_STAGE) return 100;

  if (deal.stage !== CANCELLED_STAGE) {
    return stageProgress(deal, deal.stage);
  }

  // Negociação cancelada congela o progresso na etapa em que parou.
  const lastActive = [...deal.history]
    .reverse()
    .find((entry) => entry.from && entry.from !== CANCELLED_STAGE)?.from;

  return lastActive && isActiveStage(lastActive)
    ? stageProgress(deal, lastActive)
    : 0;
}

export function nextStageOf(stage: DealStage): DealStage | null {
  if (!isActiveStage(stage)) return null;
  const index = ACTIVE_STAGES.indexOf(stage);
  return index === ACTIVE_STAGES.length - 1
    ? FINAL_STAGE
    : ACTIVE_STAGES[index + 1];
}

/* ─── Transições puras (testáveis sem tocar no disco) ──────────── */

export interface DealFailure {
  ok: false;
  status: number;
  error: string;
  blockers?: DealBlocker[];
}

export interface DealSuccess {
  ok: true;
  deal: Deal;
}

export type DealTransitionResult = DealSuccess | DealFailure;

function hasEnded(deal: Deal): DealFailure | null {
  if (deal.stage === CANCELLED_STAGE) {
    return { ok: false, status: 409, error: "Esta negociação foi cancelada." };
  }
  if (deal.stage === FINAL_STAGE) {
    return { ok: false, status: 409, error: "Esta troca já foi concluída." };
  }
  return null;
}

/**
 * Marca/desmarca uma tarefa da etapa atual.
 *
 * Guards: participante, etapa atual, lado correto. O lado é verificado aqui e
 * não só na tela porque a API é pública para qualquer sessão autenticada —
 * esconder o botão não impede ninguém de chamar o endpoint.
 */
export function applyTaskToggle(
  deal: Deal,
  userId: string,
  taskId: string,
  done: boolean,
  now: string = nowISO()
): DealTransitionResult {
  const side = getDealSide(deal, userId);
  if (!side) {
    return { ok: false, status: 403, error: "Você não participa desta negociação." };
  }

  const ended = hasEnded(deal);
  if (ended) return ended;

  const def = getStageDefinition(deal.stage);
  const task = def?.tasks.find((candidate) => candidate.id === taskId);
  if (!def || !task) {
    return {
      ok: false,
      status: 409,
      error: "Esta tarefa não pertence à etapa atual da negociação.",
    };
  }

  if (task.side !== side) {
    return {
      ok: false,
      status: 403,
      error: "Somente a outra parte pode marcar esta tarefa.",
    };
  }

  // Idempotente: repetir a mesma marcação não cria ruído no updatedAt.
  if (isTaskDone(deal, taskId) === done) return { ok: true, deal };

  const taskStates = {
    ...deal.taskStates,
    [taskId]: done
      ? { done: true, doneAt: now, doneBy: userId }
      : { done: false },
  };

  return {
    ok: true,
    deal: { ...deal, taskStates, updatedAt: now },
  };
}

/**
 * Avança uma etapa.
 *
 * Invariantes:
 *  - toda tarefa obrigatória da etapa atual, dos DOIS lados, precisa estar
 *    concluída; uma parte sozinha não fecha a etapa;
 *  - o histórico só cresce, e cada transição registra de/para/quem/quando;
 *  - etapas terminais não voltam atrás (cancelamento é uma transição própria).
 */
export function applyAdvance(
  deal: Deal,
  userId: string,
  noteInput?: string,
  now: string = nowISO()
): DealTransitionResult {
  const side = getDealSide(deal, userId);
  if (!side) {
    return { ok: false, status: 403, error: "Você não participa desta negociação." };
  }

  const ended = hasEnded(deal);
  if (ended) return ended;

  const def = getStageDefinition(deal.stage);
  if (!def) {
    return { ok: false, status: 409, error: "Etapa da negociação inválida." };
  }

  const blockers = getBlockers(deal);
  if (blockers.length > 0) {
    return {
      ok: false,
      status: 409,
      error: `Faltam ${blockers.length} tarefa(s) obrigatória(s) para avançar desta etapa.`,
      blockers,
    };
  }

  const to = nextStageOf(deal.stage);
  if (!to) {
    return { ok: false, status: 409, error: "Não há próxima etapa." };
  }

  const note = (
    noteInput?.trim() ||
    (to === FINAL_STAGE
      ? "Troca concluída: vistoria, documentos, contrato e transferência finalizados."
      : `Etapa ${def.label} concluída.`)
  ).slice(0, 500);

  const entry: DealHistoryEntry = {
    at: now,
    by: userId,
    from: deal.stage,
    to,
    note,
  };

  return {
    ok: true,
    deal: {
      ...deal,
      stage: to,
      history: [...deal.history, entry],
      updatedAt: now,
    },
  };
}

export function applyCancel(
  deal: Deal,
  userId: string,
  reasonInput?: string,
  now: string = nowISO()
): DealTransitionResult {
  const side = getDealSide(deal, userId);
  if (!side) {
    return { ok: false, status: 403, error: "Você não participa desta negociação." };
  }

  const ended = hasEnded(deal);
  if (ended) return ended;

  const reason = (
    reasonInput?.trim() || "Negociação cancelada por uma das partes."
  ).slice(0, 500);

  const entry: DealHistoryEntry = {
    at: now,
    by: userId,
    from: deal.stage,
    to: CANCELLED_STAGE,
    note: reason,
  };

  return {
    ok: true,
    deal: {
      ...deal,
      stage: CANCELLED_STAGE,
      history: [...deal.history, entry],
      updatedAt: now,
      cancelledAt: now,
      cancelledBy: userId,
      cancelReason: reason,
    },
  };
}

/* ─── Persistência ─────────────────────────────────────────────── */

/**
 * Lê, aplica e grava dentro da mesma passada. Assim duas requisições
 * simultâneas não leem o mesmo estado antigo e uma sobrescreve a outra.
 */
function mutateDeal(
  dealId: string,
  mutator: (deal: Deal) => DealTransitionResult
): DealTransitionResult {
  const deals = readData<Deal>("deals");
  const index = deals.findIndex((deal) => deal.id === dealId);
  if (index === -1) {
    return { ok: false, status: 404, error: "Negociação não encontrada." };
  }

  const result = mutator(deals[index]);
  if (!result.ok) return result;

  deals[index] = result.deal;
  writeData("deals", deals);
  return result;
}

export function getDealById(dealId: string): Deal | undefined {
  return readData<Deal>("deals").find((deal) => deal.id === dealId);
}

export function setDealTask(
  dealId: string,
  userId: string,
  taskId: string,
  done: boolean
): DealTransitionResult {
  return mutateDeal(dealId, (deal) =>
    applyTaskToggle(deal, userId, taskId, done)
  );
}

export function advanceDeal(
  dealId: string,
  userId: string,
  note?: string
): DealTransitionResult {
  return mutateDeal(dealId, (deal) => applyAdvance(deal, userId, note));
}

export function cancelDeal(
  dealId: string,
  userId: string,
  reason?: string
): DealTransitionResult {
  return mutateDeal(dealId, (deal) => applyCancel(deal, userId, reason));
}

/* ─── Criação ──────────────────────────────────────────────────── */

export interface CreateDealInput {
  matchId?: string;
  postId?: string;
  otherPostId?: string;
  cashFromA?: number;
}

export type CreateDealResult =
  | { ok: true; deal: Deal; created: boolean }
  | { ok: false; status: number; error: string };

function samePair(deal: Deal, postAId: string, postBId: string): boolean {
  return (
    (deal.postAId === postAId && deal.postBId === postBId) ||
    (deal.postAId === postBId && deal.postBId === postAId)
  );
}

/**
 * Abre uma negociação a partir de um match ou de dois anúncios.
 *
 * Autorização: o chamador precisa possuir um dos dois anúncios. Sem isso,
 * qualquer pessoa autenticada poderia abrir uma "negociação" sobre o carro
 * alheio e começar a marcar tarefas em nome de outra parte.
 */
export function createDealForUser(
  userId: string,
  input: CreateDealInput
): CreateDealResult {
  const posts = readData<CarPost>("posts");
  const matches = readData<Match>("matches");

  let postA: CarPost | undefined;
  let postB: CarPost | undefined;
  let matchId: string | undefined;
  let cashFromA = 0;

  if (input.matchId) {
    const match = matches.find((candidate) => candidate.id === input.matchId);
    if (!match) {
      return { ok: false, status: 404, error: "Match não encontrado." };
    }

    postA = posts.find((post) => post.id === match.postAId);
    postB = posts.find((post) => post.id === match.postBId);
    if (!postA || !postB) {
      return {
        ok: false,
        status: 409,
        error: "Um dos anúncios deste match não está mais disponível.",
      };
    }

    matchId = match.id;
    cashFromA = match.suggestedCashFromA;
  } else {
    if (!input.postId || !input.otherPostId) {
      return {
        ok: false,
        status: 400,
        error: "Informe um matchId ou os dois anúncios (postId e otherPostId).",
      };
    }

    if (input.postId === input.otherPostId) {
      return {
        ok: false,
        status: 400,
        error: "Um anúncio não pode negociar consigo mesmo.",
      };
    }

    let first = posts.find((post) => post.id === input.postId);
    let second = posts.find((post) => post.id === input.otherPostId);
    if (!first || !second) {
      return { ok: false, status: 404, error: "Um dos anúncios não foi encontrado." };
    }

    const ownsFirst = first.userId === userId;
    const ownsSecond = second.userId === userId;
    if (!ownsFirst && !ownsSecond) {
      return {
        ok: false,
        status: 403,
        error: "Você só pode abrir negociação com um dos seus anúncios.",
      };
    }
    if (first.userId === second.userId) {
      return {
        ok: false,
        status: 400,
        error: "Os dois anúncios pertencem à mesma pessoa.",
      };
    }

    // Canoniza A como o anúncio de quem abriu: assim o sinal de cashFromA
    // ("A paga B") tem um dono óbvio, mesmo quando a criação é manual.
    if (ownsSecond && !ownsFirst) {
      [first, second] = [second, first];
    }
    postA = first;
    postB = second;

    const existingMatch = matches.find(
      (match) =>
        (match.postAId === postA?.id && match.postBId === postB?.id) ||
        (match.postAId === postB?.id && match.postBId === postA?.id)
    );

    if (existingMatch) {
      matchId = existingMatch.id;
      cashFromA =
        existingMatch.postAId === postA.id
          ? existingMatch.suggestedCashFromA
          : -existingMatch.suggestedCashFromA;
    } else if (
      typeof input.cashFromA === "number" &&
      Number.isFinite(input.cashFromA)
    ) {
      cashFromA = Math.round(input.cashFromA);
    }
  }

  if (!postA || !postB) {
    return { ok: false, status: 404, error: "Um dos anúncios não foi encontrado." };
  }

  if (postA.userId === postB.userId) {
    return {
      ok: false,
      status: 400,
      error: "Os dois anúncios pertencem à mesma pessoa.",
    };
  }

  if (postA.userId !== userId && postB.userId !== userId) {
    return {
      ok: false,
      status: 403,
      error: "Você só pode abrir negociação com um dos seus anúncios.",
    };
  }

  // Idempotente enquanto a negociação está viva; depois de cancelada, uma nova
  // tentativa abre uma negociação nova (o histórico antigo fica preservado).
  const existing = readData<Deal>("deals").find(
    (deal) =>
      deal.stage !== CANCELLED_STAGE && samePair(deal, postA!.id, postB!.id)
  );
  if (existing) return { ok: true, deal: existing, created: false };

  const now = nowISO();
  const deal: Deal = {
    id: generateId(),
    matchId,
    postAId: postA.id,
    postBId: postB.id,
    userAId: postA.userId,
    userBId: postB.userId,
    cashFromA,
    stage: "proposta",
    taskStates: {},
    history: [
      {
        at: now,
        by: userId,
        from: null,
        to: "proposta",
        note: matchId
          ? "Negociação aberta a partir de um match."
          : "Negociação aberta manualmente entre os dois anúncios.",
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  addItem("deals", deal);

  return { ok: true, deal, created: true };
}

/* ─── Views ────────────────────────────────────────────────────── */

function userName(users: User[], id: string): string {
  return users.find((user) => user.id === id)?.name ?? "Usuário";
}

function postToView(
  post: CarPost | undefined,
  postId: string,
  ownerId: string,
  users: User[]
): DealView["postA"] {
  if (!post) {
    return {
      id: postId,
      title: "Anúncio removido",
      image: null,
      ownerName: userName(users, ownerId),
      car: { brand: "", model: "", year: 0, estimatedValue: 0 },
    };
  }

  return {
    id: post.id,
    title: post.title,
    image: post.images[0] ?? null,
    ownerName: userName(users, post.userId),
    car: post.car,
  };
}

function buildDealView(
  deal: Deal,
  side: DealSide,
  posts: CarPost[],
  users: User[]
): DealView {
  const ownerA = userName(users, deal.userAId);
  const ownerB = userName(users, deal.userBId);
  const otherPartyName = side === "A" ? ownerB : ownerA;

  const postA = postToView(
    posts.find((post) => post.id === deal.postAId),
    deal.postAId,
    deal.userAId,
    users
  );
  const postB = postToView(
    posts.find((post) => post.id === deal.postBId),
    deal.postBId,
    deal.userBId,
    users
  );

  const stageIndex = DEAL_STAGES.indexOf(deal.stage as ActiveDealStage);
  const isTerminal =
    deal.stage === FINAL_STAGE || deal.stage === CANCELLED_STAGE;

  const blockers: DealBlockerView[] = getBlockers(deal).map((blocker) => ({
    ...blocker,
    sideLabel: blocker.side === side ? "Você" : otherPartyName,
    ownerName: blocker.side === "A" ? ownerA : ownerB,
  }));

  const cancelEntry = [...deal.history]
    .reverse()
    .find((entry) => entry.to === CANCELLED_STAGE);
  const cancelledStageIndex =
    deal.stage === CANCELLED_STAGE && cancelEntry?.from
      ? DEAL_STAGES.indexOf(cancelEntry.from as ActiveDealStage)
      : -1;

  const stages: DealStageView[] = DEAL_STAGES.map((stage, index) => {
    let status: DealStageView["status"] = "pending";
    if (deal.stage === FINAL_STAGE) {
      status = "done";
    } else if (deal.stage !== CANCELLED_STAGE) {
      status =
        index < stageIndex ? "done" : index === stageIndex ? "current" : "pending";
    } else if (index < cancelledStageIndex) {
      status = "done";
    }
    return { stage, label: getStageLabel(stage), status };
  });

  const def = getStageDefinition(deal.stage);
  const currentStage = def
    ? {
        stage: def.stage,
        label: def.label,
        summary: def.summary,
        tasks: def.tasks.map((task) => ({
          ...task,
          done: isTaskDone(deal, task.id),
          doneAt: deal.taskStates[task.id]?.doneAt,
          canToggle: !isTerminal && task.side === side,
        })),
      }
    : null;

  const history: DealHistoryView[] = deal.history.map((entry) => ({
    ...entry,
    byName: userName(users, entry.by),
    fromLabel: entry.from ? getStageLabel(entry.from) : "Início",
    toLabel: getStageLabel(entry.to),
  }));

  const delta = side === "A" ? deal.cashFromA : -deal.cashFromA;
  const viewerCash =
    delta === 0
      ? {
          direction: "none" as const,
          amount: 0,
          label: "Troca direta, sem diferença em dinheiro",
        }
      : delta > 0
        ? {
            direction: "pay" as const,
            amount: delta,
            label: `Você paga R$ ${formatBRL(delta)} para ${otherPartyName}`,
          }
        : {
            direction: "receive" as const,
            amount: -delta,
            label: `Você recebe R$ ${formatBRL(-delta)} de ${otherPartyName}`,
          };

  const cashNeutralLabel =
    deal.cashFromA === 0
      ? "Troca direta, sem diferença em dinheiro"
      : deal.cashFromA > 0
        ? `${ownerA} paga R$ ${formatBRL(deal.cashFromA)} para ${ownerB}`
        : `${ownerB} paga R$ ${formatBRL(-deal.cashFromA)} para ${ownerA}`;

  return {
    id: deal.id,
    matchId: deal.matchId ?? null,
    stage: deal.stage,
    stageLabel: getStageLabel(deal.stage),
    stageIndex,
    isTerminal,
    progress: computeProgress(deal),
    viewerSide: side,
    viewerPostId: side === "A" ? deal.postAId : deal.postBId,
    otherPostId: side === "A" ? deal.postBId : deal.postAId,
    otherPartyName,
    cashFromA: deal.cashFromA,
    cashNeutralLabel,
    viewerCash,
    postA,
    postB,
    stages,
    currentStage,
    blockers,
    canAdvance: !isTerminal && blockers.length === 0,
    history,
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt,
    cancelledAt: deal.cancelledAt,
    cancelledByName: deal.cancelledBy
      ? userName(users, deal.cancelledBy)
      : undefined,
    cancelReason: deal.cancelReason,
  };
}

/** Devolve null também para não-participante: a API responde 404 sem vazar. */
export function getDealViewForUser(
  dealId: string,
  userId: string
): DealView | null {
  const deal = getDealById(dealId);
  if (!deal) return null;

  const side = getDealSide(deal, userId);
  if (!side) return null;

  return buildDealView(
    deal,
    side,
    readData<CarPost>("posts"),
    readData<User>("users")
  );
}

export function listDealViewsForUser(userId: string): DealView[] {
  const posts = readData<CarPost>("posts");
  const users = readData<User>("users");

  return readData<Deal>("deals")
    .filter((deal) => getDealSide(deal, userId) !== null)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    .map((deal) => buildDealView(deal, getDealSide(deal, userId)!, posts, users));
}
