export interface User {
  id: string;
  name: string;
  email: string;
  provider: "google" | "email";
  avatar?: string;
  createdAt: string;
}

export interface CarDetail {
  brand: string;
  model: string;
  year: number;
  estimatedValue: number;
  /** Vehicle mileage in km */
  mileage?: number;
  /** Vehicle exterior color */
  color?: string;
  /** Vehicle location (city/state) */
  localization?: string;
  /** FIPE codes for edit pre-fill */
  fipeBrandId?: string;
  fipeModelCode?: string;
  fipeYearCode?: string;
}

export interface DesiredVehicle {
  brand: string;
  model: string;          // modelo geral ex: "Fit" (primeira palavra do nome FIPE)
  version?: string;       // versão específica ex: "CX 1.4 Flex 16V 5p"
  transmission?: string;  // "Automático" | "Manual"
  yearMin?: number;
  yearMax?: number;
  /** Range of mileage in km (optional) */
  mileageMin?: number;
  mileageMax?: number;
  cashAdjustment: number;        // quanto o dono do post paga (+) ou recebe (-)
  cashAdjustmentTolerance: number; // ±tolerância
  /** FIPE codes for edit pre-fill */
  fipeBrandId?: string;
  fipeVersionCode?: string;
  /** Vehicle body type — when set, brand/model/version are ignored in matching */
  vehicleType?: 'SUV' | 'Caminhonete' | 'Hatch' | 'Sedan';
}

export interface DesiredTrade {
  vehicles: DesiredVehicle[];
  /** Maximum distance in km from the vehicle's location (general setting for the post) */
  maxDistance?: number;
}

export interface CarPost {
  id: string;
  userId: string;
  title: string;
  description: string;
  car: CarDetail;
  desiredTrade: DesiredTrade;
  contactInfo: {
    whatsapp?: string;
    email?: string;
  };
  images: string[];
  createdAt: string;
  isActive: boolean;
}

export interface Match {
  id: string;
  postAId: string;
  postBId: string;
  score: number;
  suggestedCashFromA: number; // quanto A paga pra B (negativo = B paga A)
  status: "pending" | "contacted";
  createdAt: string;
}

export interface Conversation {
  id: string;
  postId: string;
  participantIds: string[];  // exactly 2 user IDs
  matchId?: string;          // set when auto-created from a match
  createdAt: string;
  updatedAt: string;         // bumped on each new message
  /** ISO timestamp of the last time each participant opened the thread. */
  lastReadAt?: Record<string, string>;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
}

/* ─── Troca Fechada: negociação ─────────────────────────────────── */

/**
 * Etapas da troca, na ordem em que acontecem no Brasil.
 * `cancelada` é terminal e não faz parte da esteira.
 */
export type DealStage =
  | "proposta"
  | "aceite"
  | "vistoria"
  | "documentos"
  | "contrato"
  | "transferencia"
  | "concluida"
  | "cancelada";

/** Lado da negociação. A é sempre `postAId`; B é sempre `postBId`. */
export type DealSide = "A" | "B";

/**
 * Tarefa de uma etapa. `side` existe porque documentos e vistorias são
 * responsabilidade de cada proprietário sobre o seu próprio carro.
 */
export interface DealTaskDef {
  id: string;
  title: string;
  description: string;
  side: DealSide;
  required: boolean;
}

/** Estado persistido de uma tarefa (só o que muda; a definição é código). */
export interface DealTaskState {
  done: boolean;
  doneAt?: string;
  /** Quem marcou — a trilha de auditoria também precisa disso. */
  doneBy?: string;
}

/** Transição imutável da negociação. Nunca é editada depois de gravada. */
export interface DealHistoryEntry {
  at: string;
  by: string;
  from: DealStage | null;
  to: DealStage;
  note: string;
}

/** Pendência que impede o avanço da etapa atual. */
export interface DealBlocker {
  stage: DealStage;
  taskId: string;
  title: string;
  side: DealSide;
}

export interface Deal {
  id: string;
  /** Presente quando a negociação nasceu de um match. */
  matchId?: string;
  postAId: string;
  postBId: string;
  userAId: string;
  userBId: string;
  /** Positivo = A paga B; negativo = B paga A; zero = troca direta. */
  cashFromA: number;
  stage: DealStage;
  /** taskId → estado. Tarefas que nunca foram tocadas ficam ausentes. */
  taskStates: Record<string, DealTaskState>;
  history: DealHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
}

/* ─── Views serializáveis para o cliente ───────────────────────── */

export interface DealPostView {
  id: string;
  title: string;
  image: string | null;
  ownerName: string;
  car: CarDetail;
}

export interface DealTaskView extends DealTaskDef {
  done: boolean;
  doneAt?: string;
  /** Só a própria parte pode marcar, e só na etapa atual. */
  canToggle: boolean;
}

export interface DealStageView {
  stage: Exclude<DealStage, "cancelada">;
  label: string;
  status: "done" | "current" | "pending";
}

export interface DealHistoryView extends DealHistoryEntry {
  byName: string;
  fromLabel: string;
  toLabel: string;
}

export interface DealBlockerView extends DealBlocker {
  sideLabel: string;
  ownerName: string;
}

export interface DealCashView {
  direction: "pay" | "receive" | "none";
  amount: number;
  label: string;
}

/**
 * Forma que a UI consome. É calculada no servidor para que duas telas nunca
 * cheguem a conclusões diferentes sobre quem paga quem ou o que bloqueia.
 */
export interface DealView {
  id: string;
  matchId: string | null;
  stage: DealStage;
  stageLabel: string;
  stageIndex: number;
  isTerminal: boolean;
  progress: number;
  viewerSide: DealSide;
  viewerPostId: string;
  otherPostId: string;
  otherPartyName: string;
  cashFromA: number;
  cashNeutralLabel: string;
  viewerCash: DealCashView;
  postA: DealPostView;
  postB: DealPostView;
  stages: DealStageView[];
  currentStage: {
    stage: DealStage;
    label: string;
    summary: string;
    tasks: DealTaskView[];
  } | null;
  blockers: DealBlockerView[];
  canAdvance: boolean;
  history: DealHistoryView[];
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  cancelledByName?: string;
  cancelReason?: string;
}
