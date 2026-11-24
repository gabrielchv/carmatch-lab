import type {
  CarPost,
  DossierKey,
  User,
  UserVerifications,
  VehicleDossier,
  VerificationKey,
} from "./types";

/**
 * Confiança — the trust model.
 *
 * This product has no in-app chat: the first WhatsApp message is the entire
 * first impression, and a stranger is about to hand over a car. This module
 * turns "did the person prove anything?" and "does the car have documents?"
 * into one number that travels with the listing and with the message.
 *
 * Pure on purpose (no `node:fs`, no server-only imports) so the same scoring
 * runs in the API route, in the badges and in client components. If the badge
 * and the API disagreed about a score, the badge would be a lie.
 */

export type TrustLevel = "novo" | "verificado" | "confiavel";

/** Cheapest level first. Used for `minTrust` filtering and comparisons. */
export const TRUST_LEVELS: readonly TrustLevel[] = [
  "novo",
  "verificado",
  "confiavel",
];

export interface SignalDefinition {
  key: VerificationKey;
  label: string;
  /** Contribution to the 0-100 user score. The signal weights sum to 100. */
  weight: number;
  /** What the person has to show, in one line. */
  hint: string;
}

export interface DossierDefinition {
  key: DossierKey;
  label: string;
  /** Contribution to the 0-100 dossier score. These weights sum to 100. */
  weight: number;
  hint: string;
}

/* ─── Identity signals ─────────────────────────────────────────── */

/**
 * Why these weights (they sum to 100, so the score is already a percentage):
 *
 * · e-mail (5) — the cheapest possible proof. Anyone can hold an address; it
 *   only guarantees the account is reachable. Deliberately almost worthless as
 *   identity evidence, so it cannot inflate a brand-new account on its own.
 * · telefone (20) — WhatsApp is the only channel this product has. A confirmed
 *   number means the person on the other end is reachable and is who the chat
 *   claims. High value, low friction: every Brazilian already has one.
 * · CPF (25) — the national identity anchor. Name + CPF is what the cartório
 *   checks at transfer, so it is the strongest link between the account and a
 *   legally accountable person. Worth more than any other single signal.
 * · CNH (15) — proves a real licensed driver, but plenty of owners are not the
 *   daily driver (a spouse, a parent). Real evidence, weaker tie to the seller.
 * · selfie/liveness (20) — proves a living person exists behind the account and
 *   matches the document photo. Strong against stolen-photo fraud, but on its
 *   own it does not tie that person to a legal identity the way CPF does.
 * · comprovante de residência (15) — a stable address is where the car is and
 *   where recourse lives if the deal goes wrong. Useful, but less identity-
 *   defining than CPF or CNH.
 */
export const USER_SIGNALS: readonly SignalDefinition[] = [
  {
    key: "email",
    label: "E-mail",
    weight: 5,
    hint: "Confirme o endereço que você usa para entrar.",
  },
  {
    key: "phone",
    label: "Telefone (WhatsApp)",
    weight: 20,
    hint: "Confirme o número que aparece nos seus anúncios.",
  },
  {
    key: "cpf",
    label: "CPF",
    weight: 25,
    hint: "Nome e CPF conferem com a Receita Federal.",
  },
  {
    key: "cnh",
    label: "CNH",
    weight: 15,
    hint: "CNH válida em seu nome. Guardamos só o resultado, nunca o número.",
  },
  {
    key: "selfie",
    label: "Selfie (prova de vida)",
    weight: 20,
    hint: "Selfie comparada com a foto do documento.",
  },
  {
    key: "residence",
    label: "Comprovante de residência",
    weight: 15,
    hint: "Conta de água, luz ou telefone dos últimos 90 dias.",
  },
];

/* ─── Vehicle dossier ──────────────────────────────────────────── */

/**
 * Why these weights (they also sum to 100):
 *
 * · documento no nome do vendedor (30) — without it the transfer cannot happen
 *   at all. The only item that is a hard legal blocker, so it carries the most
 *   weight by a wide margin.
 * · sem gravame (20) — an alienação fiduciária means the car is not fully the
 *   seller's to trade. Second only to the document: the deal is impossible
 *   until the lien is cleared.
 * · sem multas (15) — fines follow the vehicle and can block licenciamento.
 *   Real money and real hassle, but usually solvable.
 * · laudo de vistoria (15) — an independent inspection is the only evidence
 *   about the car itself (structure, odometer) that a buyer cannot see. Equal
 *   to fines because it substitutes for the buyer's own eyes.
 * · histórico de revisões (10) — corroborates mileage and care. Strong support,
 *   not decisive on its own.
 * · sem recall (5) — a small, checkable safety item; almost always clear, so it
 *   adds little differentiation.
 * · único dono (5) — a soft provenance signal. Nice to have, proves nothing.
 */
export const DOSSIER_ITEMS: readonly DossierDefinition[] = [
  {
    key: "document",
    label: "Documento no nome do vendedor",
    weight: 30,
    hint: "CRLV ou ATPV-e emitido no nome de quem anuncia.",
  },
  {
    key: "noLien",
    label: "Sem gravame",
    weight: 20,
    hint: "Consulta ao Detran sem alienação fiduciária ou financiamento.",
  },
  {
    key: "noFines",
    label: "Sem multas",
    weight: 15,
    hint: "Nada em aberto no Detran que trave o licenciamento.",
  },
  {
    key: "inspection",
    label: "Laudo de vistoria",
    weight: 15,
    hint: "Vistoria cautelar de empresa independente, com data.",
  },
  {
    key: "serviceHistory",
    label: "Histórico de revisões",
    weight: 10,
    hint: "Revisões feitas, com quilometragem coerente.",
  },
  {
    key: "noRecall",
    label: "Sem recall pendente",
    weight: 5,
    hint: "Consulta no site do fabricante pelo chassi.",
  },
  {
    key: "singleOwner",
    label: "Único dono",
    weight: 5,
    hint: "CRLV com um único proprietário desde zero.",
  },
];

/* ─── Level thresholds ─────────────────────────────────────────── */

/**
 * User levels.
 *
 * · verificado ≥ 35 — reachable with one strong signal plus one cheap one
 *   (telefone 20 + CNH 15 = 35, or CPF 25 + e-mail 5 + ... ). Below it, e-mail
 *   alone (5) or CPF alone (25) does not say "checked account"; it is simply
 *   not verified yet.
 * · confiavel ≥ 70 — requires several independent proofs including at least
 *   one identity anchor (CPF/CNH) and one liveness proof. High enough that it
 *   cannot be reached by ticking only the cheap boxes.
 */
export const USER_LEVEL_THRESHOLDS = { verificado: 35, confiavel: 70 } as const;

/**
 * Listing levels. The listing score is 40% owner + 60% dossier.
 *
 * · verificado ≥ 40 — the minimum where the badge means something: either a
 *   solidly verified owner with some dossier, or a partially documented car
 *   with a new owner. Below that the badge is just decoration.
 * · confiavel ≥ 70 — both sides substantially filled. A perfect dossier with an
 *   empty owner profile lands at 60, so it deliberately cannot reach the top
 *   level: the car may be perfect and the person still a stranger.
 */
export const LISTING_LEVEL_THRESHOLDS = { verificado: 40, confiavel: 70 } as const;

/**
 * Why 40/60 and not 50/50: what is being handed over is the car. Dossier items
 * are harder to fake (they come from Detran, an inspection shop, the CRLV) and
 * describe the actual object of the trade, while an account can be perfectly
 * verified and still offer a car with a lien. The weight follows the risk.
 */
export const OWNER_WEIGHT = 0.4;
export const DOSSIER_WEIGHT = 0.6;

/* ─── Shapes ───────────────────────────────────────────────────── */

export interface TrustStep extends SignalDefinition {
  confirmed: boolean;
}

export interface DossierItem extends DossierDefinition {
  confirmed: boolean;
}

export interface UserTrust {
  /** 0-100. */
  score: number;
  level: TrustLevel;
  steps: TrustStep[];
  confirmed: number;
  total: number;
}

export interface DossierScore {
  /** 0-100. */
  score: number;
  items: DossierItem[];
  confirmed: number;
  total: number;
}

export interface ListingTrust {
  /** 0-100: 40% owner + 60% dossier. */
  score: number;
  level: TrustLevel;
  owner: { score: number; level: TrustLevel; confirmed: number; total: number };
  dossier: { score: number; confirmed: number; total: number };
}

/** A post as returned by the API: the stored record plus its computed trust. */
export type TrustedPost = CarPost & { trust?: ListingTrust };

/* ─── Helpers ──────────────────────────────────────────────────── */

/**
 * Percentage of the available weight that is confirmed.
 *
 * Divided by the total weight instead of a hard-coded 100 so adding or
 * re-balancing a signal keeps the score in range instead of silently exceeding
 * it. With the tables above the two are identical by construction.
 */
function weightedScore(
  items: readonly { weight: number; confirmed: boolean }[]
): number {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) return 0;
  const confirmed = items.reduce(
    (sum, item) => sum + (item.confirmed ? item.weight : 0),
    0
  );
  return Math.round((confirmed / total) * 100);
}

function levelFromScore(
  score: number,
  thresholds: { verificado: number; confiavel: number }
): TrustLevel {
  if (score >= thresholds.confiavel) return "confiavel";
  if (score >= thresholds.verificado) return "verificado";
  return "novo";
}

const USER_SIGNAL_KEYS: readonly VerificationKey[] = USER_SIGNALS.map(
  (signal) => signal.key
);
const DOSSIER_KEYS: readonly DossierKey[] = DOSSIER_ITEMS.map((item) => item.key);

export function isVerificationKey(value: unknown): value is VerificationKey {
  return (
    typeof value === "string" &&
    (USER_SIGNAL_KEYS as readonly string[]).includes(value)
  );
}

export function isDossierKey(value: unknown): value is DossierKey {
  return (
    typeof value === "string" &&
    (DOSSIER_KEYS as readonly string[]).includes(value)
  );
}

/* ─── Scoring ──────────────────────────────────────────────────── */

/**
 * Identity score for one person.
 *
 * Accepts `null`/`undefined` and records written before Confiança existed:
 * every absent flag simply means "not verified", which is why old data keeps
 * working without a migration.
 */
export function userTrust(
  user?: Pick<User, "verifications"> | null
): UserTrust {
  const flags: UserVerifications = user?.verifications ?? {};
  const steps: TrustStep[] = USER_SIGNALS.map((signal) => ({
    ...signal,
    confirmed: flags[signal.key] === true,
  }));
  const score = weightedScore(steps);

  return {
    score,
    level: levelFromScore(score, USER_LEVEL_THRESHOLDS),
    steps,
    confirmed: steps.filter((step) => step.confirmed).length,
    total: steps.length,
  };
}

/** Vehicle dossier score for one listing. Same "absent means false" rule. */
export function dossierScore(
  post?: Pick<CarPost, "dossier"> | null
): DossierScore {
  const flags: VehicleDossier = post?.dossier ?? {};
  const items: DossierItem[] = DOSSIER_ITEMS.map((item) => ({
    ...item,
    confirmed: flags[item.key] === true,
  }));
  const score = weightedScore(items);

  return {
    score,
    items,
    confirmed: items.filter((item) => item.confirmed).length,
    total: items.length,
  };
}

/**
 * The number that travels with the listing: 40% owner + 60% vehicle dossier.
 * Rationale above (`OWNER_WEIGHT`, `LISTING_LEVEL_THRESHOLDS`).
 */
export function listingTrust(
  post: Pick<CarPost, "dossier"> | null | undefined,
  owner: Pick<User, "verifications"> | null | undefined
): ListingTrust {
  const ownerTrust = userTrust(owner);
  const dossier = dossierScore(post);
  const score = Math.round(
    ownerTrust.score * OWNER_WEIGHT + dossier.score * DOSSIER_WEIGHT
  );

  return {
    score,
    level: levelFromScore(score, LISTING_LEVEL_THRESHOLDS),
    owner: {
      score: ownerTrust.score,
      level: ownerTrust.level,
      confirmed: ownerTrust.confirmed,
      total: ownerTrust.total,
    },
    dossier: {
      score: dossier.score,
      confirmed: dossier.confirmed,
      total: dossier.total,
    },
  };
}

/* ─── Level helpers ────────────────────────────────────────────── */

export function trustLevelRank(level: TrustLevel): number {
  return TRUST_LEVELS.indexOf(level);
}

/** Does `level` meet or exceed `min`? Used by the server-side `minTrust` filter. */
export function meetsLevel(level: TrustLevel, min: TrustLevel): boolean {
  return trustLevelRank(level) >= trustLevelRank(min);
}

/**
 * Parse a `minTrust` query value.
 *
 * Accepts the accented spelling ("confiável") because that is what a human
 * types, while the stored value is always the ASCII key. Returns null for
 * anything else so the route can answer 400 instead of silently ignoring a
 * filter the visitor believes is active.
 */
export function parseTrustLevel(
  raw: string | null | undefined
): TrustLevel | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === "confiável") return "confiavel";
  return (TRUST_LEVELS as readonly string[]).includes(value)
    ? (value as TrustLevel)
    : null;
}

const LEVEL_LABELS: Record<TrustLevel, string> = {
  novo: "Novo",
  verificado: "Verificado",
  confiavel: "Confiável",
};

export function levelLabel(level: TrustLevel): string {
  return LEVEL_LABELS[level];
}

/** "Faltam 12 pontos para Confiável" — used on /confianca. */
export function nextUserLevel(score: number): {
  level: TrustLevel | null;
  missing: number;
} {
  if (score < USER_LEVEL_THRESHOLDS.verificado) {
    return {
      level: "verificado",
      missing: USER_LEVEL_THRESHOLDS.verificado - score,
    };
  }
  if (score < USER_LEVEL_THRESHOLDS.confiavel) {
    return {
      level: "confiavel",
      missing: USER_LEVEL_THRESHOLDS.confiavel - score,
    };
  }
  return { level: null, missing: 0 };
}
