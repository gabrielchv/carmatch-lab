import type {
  CarPost,
  DossierItemKey,
  PostDossier,
  User,
  UserVerifications,
  VerificationSignal,
} from "./types";

/**
 * Trust model for "CarMatch Confiança".
 *
 * Pure functions only: the same code runs on the server (listing filter) and
 * in the browser (score preview, badges). No filesystem, no env, no fetching.
 */

export type TrustLevel = "novo" | "verificado" | "confiavel";

export const TRUST_LEVEL_LABELS: Record<TrustLevel, string> = {
  novo: "Novo",
  verificado: "Verificado",
  confiavel: "Confiável",
};

/** Higher wins — used by the listing filter to compare levels. */
export const TRUST_LEVEL_ORDER: Record<TrustLevel, number> = {
  novo: 0,
  verificado: 1,
  confiavel: 2,
};

/**
 * Thresholds are deliberately blunt and public: a score is not a credit
 * rating, it is a screen. 40 is "the person showed up", 75 is "both the
 * person and the car have a dossier".
 */
export function trustLevel(score: number): TrustLevel {
  if (score >= 75) return "confiavel";
  if (score >= 40) return "verificado";
  return "novo";
}

// ─────────────────────────────────────────────────────────────
// User verification
// ─────────────────────────────────────────────────────────────

export interface VerificationStep {
  key: VerificationSignal;
  label: string;
  description: string;
  weight: number;
}

/**
 * Weights sum to 100.
 *
 * CPF (25) and the liveness selfie (20) carry the most because together they
 * answer the only question that matters for a car handover: "is this a real,
 * identifiable person?". CPF alone proves little in Brazil (the number is not
 * secret), so it only pays off when a live selfie binds it to a face. CNH (15)
 * is a photo-ID that also proves the person may legally drive. Phone (20) and
 * address (15) are costly enough to fake that they carry medium weight.
 * E-mail (5) is almost free, so it is a contact channel rather than proof —
 * the smallest slice on purpose.
 */
export const VERIFICATION_STEPS: VerificationStep[] = [
  {
    key: "email",
    label: "E-mail confirmado",
    description: "Confirma que você recebe e responde mensagens.",
    weight: 5,
  },
  {
    key: "phone",
    label: "Telefone confirmado",
    description: "Número ativo com código de confirmação (simulado localmente).",
    weight: 20,
  },
  {
    key: "cpf",
    label: "CPF conferido",
    description:
      "Nome e CPF batem com a base da Receita (simulado). Não guardamos o número.",
    weight: 25,
  },
  {
    key: "cnh",
    label: "CNH conferida",
    description: "Licença de motorista válida e com foto, conferida com o CPF.",
    weight: 15,
  },
  {
    key: "selfie",
    label: "Selfie com prova de vida",
    description: "Prova que uma pessoa real está por trás do CPF.",
    weight: 20,
  },
  {
    key: "address",
    label: "Comprovante de residência",
    description: "Conta de consumo recente no seu nome ou no da sua família.",
    weight: 15,
  },
];

const VERIFICATION_KEYS = new Set<string>(
  VERIFICATION_STEPS.map((step) => step.key)
);

export function isVerificationSignal(
  value: unknown
): value is VerificationSignal {
  return typeof value === "string" && VERIFICATION_KEYS.has(value);
}

export interface VerificationStepState extends VerificationStep {
  confirmed: boolean;
  confirmedAt?: string;
}

export interface UserTrust {
  score: number;
  level: TrustLevel;
  steps: VerificationStepState[];
  verified: VerificationSignal[];
  missing: VerificationSignal[];
}

export function userTrust(user: User | null | undefined): UserTrust {
  const verifications: UserVerifications = user?.verifications ?? {};

  const steps: VerificationStepState[] = VERIFICATION_STEPS.map((step) => ({
    ...step,
    confirmed: verifications[step.key] === true,
    confirmedAt: verifications.confirmedAt?.[step.key],
  }));

  // Cap at 100 defensively: a future signal must not push the score past the
  // documented scale, because the level thresholds assume 0-100.
  const score = Math.min(
    100,
    steps.reduce((sum, step) => sum + (step.confirmed ? step.weight : 0), 0)
  );

  return {
    score,
    level: trustLevel(score),
    steps,
    verified: steps.filter((s) => s.confirmed).map((s) => s.key),
    missing: steps.filter((s) => !s.confirmed).map((s) => s.key),
  };
}

/** Points still needed for the next level, or null when already at the top. */
export function nextTrustLevel(
  score: number
): { level: TrustLevel; missingPoints: number } | null {
  if (score < 40) return { level: "verificado", missingPoints: 40 - score };
  if (score < 75) return { level: "confiavel", missingPoints: 75 - score };
  return null;
}

// ─────────────────────────────────────────────────────────────
// Vehicle dossier
// ─────────────────────────────────────────────────────────────

/** Two logged services are enough to call the history "documented". */
export const MIN_SERVICE_ENTRIES = 2;

export interface DossierItemMeta {
  key: DossierItemKey;
  label: string;
  description: string;
  weight: number;
  /** "toggle" items are confirmed by the owner; "entries" fill themselves. */
  mode: "toggle" | "entries";
}

/**
 * Dossier weights mirror what actually blocks a transfer in Brazil, not what
 * sounds impressive. Ownership (30) is the blocker: a car not in the seller's
 * name cannot be safely transferred. Liens (20) are next because a financed
 * car can be repossessed. Fines (15) follow the vehicle and block transfer,
 * and an independent inspection (15) is the actual condition check. Service
 * history (10) reduces hidden-defect risk. Recall (5) and single owner (5) are
 * soft signals of care — worth points, never decisive on their own.
 */
export const DOSSIER_ITEMS: DossierItemMeta[] = [
  {
    key: "ownership",
    label: "Documento no nome do vendedor",
    description:
      "CRLV em nome de quem anuncia — sem procuração ou terceiro no meio.",
    weight: 30,
    mode: "toggle",
  },
  {
    key: "fines",
    label: "Sem multas pendentes",
    description: "Consulta de multas e débitos do veículo sem pendências.",
    weight: 15,
    mode: "toggle",
  },
  {
    key: "liens",
    label: "Sem gravame ou alienação",
    description: "Carro quitado, sem financiamento ou restrição judicial.",
    weight: 20,
    mode: "toggle",
  },
  {
    key: "recall",
    label: "Sem recall pendente",
    description: "Nenhuma campanha de segurança em aberto para o modelo.",
    weight: 5,
    mode: "toggle",
  },
  {
    key: "inspection",
    label: "Laudo de vistoria",
    description: "Vistoria cautelar recente anexada ao anúncio.",
    weight: 15,
    mode: "toggle",
  },
  {
    key: "serviceHistory",
    label: "Histórico de revisões",
    description: `Ao menos ${MIN_SERVICE_ENTRIES} revisões registradas com data e km.`,
    weight: 10,
    mode: "entries",
  },
  {
    key: "singleOwner",
    label: "Único dono",
    description: "O veículo teve um único proprietário desde zero.",
    weight: 5,
    mode: "toggle",
  },
];

const DOSSIER_KEYS = new Set<string>(DOSSIER_ITEMS.map((item) => item.key));

export function isDossierItemKey(value: unknown): value is DossierItemKey {
  return typeof value === "string" && DOSSIER_KEYS.has(value);
}

export function dossierItemPassed(
  dossier: PostDossier | undefined,
  key: DossierItemKey
): boolean {
  if (!dossier) return false;
  if (key === "serviceHistory") {
    // Entries are the real evidence; the boolean exists for imported data.
    return (
      (dossier.serviceEntries?.length ?? 0) >= MIN_SERVICE_ENTRIES ||
      dossier.serviceHistory === true
    );
  }
  return dossier[key] === true;
}

export interface DossierItemState extends DossierItemMeta {
  passed: boolean;
  confirmedAt?: string;
  detail?: string;
}

export interface DossierTrust {
  score: number;
  level: TrustLevel;
  items: DossierItemState[];
  passed: DossierItemKey[];
  pending: DossierItemKey[];
  serviceEntryCount: number;
}

export function dossierTrust(post: CarPost | null | undefined): DossierTrust {
  const dossier = post?.dossier;
  const entryCount = dossier?.serviceEntries?.length ?? 0;

  const items: DossierItemState[] = DOSSIER_ITEMS.map((meta) => ({
    ...meta,
    passed: dossierItemPassed(dossier, meta.key),
    confirmedAt: dossier?.confirmedAt?.[meta.key],
    detail:
      meta.key === "serviceHistory"
        ? `${entryCount} revisão${entryCount === 1 ? "" : "ões"} registrada${
            entryCount === 1 ? "" : "s"
          }`
        : undefined,
  }));

  const score = Math.min(
    100,
    items.reduce((sum, item) => sum + (item.passed ? item.weight : 0), 0)
  );

  return {
    score,
    level: trustLevel(score),
    items,
    passed: items.filter((i) => i.passed).map((i) => i.key),
    pending: items.filter((i) => !i.passed).map((i) => i.key),
    serviceEntryCount: entryCount,
  };
}

// ─────────────────────────────────────────────────────────────
// Listing-level trust (owner + vehicle)
// ─────────────────────────────────────────────────────────────

export interface PostTrustSummary {
  ownerLevel: TrustLevel;
  ownerScore: number;
  ownerVerified: number;
  ownerTotal: number;
  dossierLevel: TrustLevel;
  dossierScore: number;
  dossierPassed: number;
  dossierTotal: number;
  listingScore: number;
  listingLevel: TrustLevel;
}

/**
 * The listing blends the two halves of the promise. The dossier carries 60%
 * because it describes *this car*, which is what a buyer can actually inspect;
 * the owner's verification carries 40% because a perfect dossier from an
 * unverified stranger is still a leap of faith. Neither half alone reaches
 * "confiável": a maxed owner with no dossier scores 40, a maxed dossier with
 * an unverified owner scores 60. That is the product thesis expressed as
 * arithmetic.
 */
export const LISTING_OWNER_WEIGHT = 0.4;
export const LISTING_DOSSIER_WEIGHT = 0.6;

export function postTrustSummary(
  post: CarPost,
  owner: User | null | undefined
): PostTrustSummary {
  const ownerTrust = userTrust(owner);
  const dossier = dossierTrust(post);
  const listingScore = Math.min(
    100,
    Math.round(
      ownerTrust.score * LISTING_OWNER_WEIGHT +
        dossier.score * LISTING_DOSSIER_WEIGHT
    )
  );

  return {
    ownerLevel: ownerTrust.level,
    ownerScore: ownerTrust.score,
    ownerVerified: ownerTrust.verified.length,
    ownerTotal: ownerTrust.steps.length,
    dossierLevel: dossier.level,
    dossierScore: dossier.score,
    dossierPassed: dossier.passed.length,
    dossierTotal: dossier.items.length,
    listingScore,
    listingLevel: trustLevel(listingScore),
  };
}

/** Server-side listing filter — `minLevel` comes from the `minTrust` param. */
export function matchesTrustFilter(
  post: CarPost,
  user: User | null | undefined,
  minLevel: TrustLevel | null | undefined
): boolean {
  if (!minLevel || minLevel === "novo") return true;
  return (
    TRUST_LEVEL_ORDER[postTrustSummary(post, user).listingLevel] >=
    TRUST_LEVEL_ORDER[minLevel]
  );
}

/** Accepts the URL spelling, including the accented Portuguese label. */
export function parseTrustLevel(
  value: string | null | undefined
): TrustLevel | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "confiavel" || normalized === "confiável") {
    return "confiavel";
  }
  if (normalized === "verificado") return "verificado";
  if (normalized === "novo") return "novo";
  return null;
}

/** API shape: the stored post plus the trust summary computed for it. */
export type PostWithTrust = CarPost & { trust?: PostTrustSummary };
