import type { CarPost } from "./types";
import { formatBRL } from "./cash";
import { shortCarName } from "./whatsapp";
import {
  previewMatches,
  type PreviewCar,
  type PreviewWant,
} from "./onboarding";

/**
 * Radar — the watch service.
 *
 * CarMatch has no chat, so nothing pulls a user back after they leave: a match
 * only exists if they happen to reopen the site. A radar is a saved search the
 * product keeps checking. The user says what they are watching, and the alert
 * is the reason to come back.
 *
 * This module is deliberately pure: it has no filesystem access and no Node
 * built-ins, because the `/radar` screen and the onboarding hand-off import it
 * in the browser. The persistence and HTTP layers live in `app/api/radars`.
 *
 * Evaluation reuses `previewMatches` from `lib/onboarding.ts` instead of
 * re-implementing the rules. That is the whole point: a radar that disagreed
 * with the wizard would be worse than no radar at all.
 */

export type RadarKind = "match" | "inbound" | "outbound";

/** The car the user already has (what they bring to a swap). */
export interface RadarHave {
  brand: string;
  model: string;
  year?: number;
  estimatedValue?: number;
}

/** The car the user wants (what they would accept). */
export interface RadarWant {
  brand: string;
  model: string;
  yearMin?: number;
  yearMax?: number;
}

export interface Radar {
  id: string;
  userId: string;
  name: string;
  kind: RadarKind;
  have?: RadarHave;
  want?: RadarWant;
  city?: string;
  radiusKm?: number;
  createdAt: string;
  /**
   * When an alert message was last generated for this radar.
   *
   * It does NOT claim WhatsApp delivered anything: there is no WhatsApp
   * Business API here, so the product cannot know that. It records the moment
   * the user opened the pre-written alert.
   */
  lastNotifiedAt?: string;
}

export interface RadarEvaluation {
  hits: CarPost[];
  /** How many hits `hits` contains. Kept separate for API/UI symmetry. */
  total: number;
}

export interface RadarKindInfo {
  label: string;
  /** Short phrase used in the UI and in the alert message. */
  description: string;
  /** What the user is watching, in one line. */
  prompt: string;
  needsHave: boolean;
  needsWant: boolean;
}

export const RADAR_KIND_INFO: Record<RadarKind, RadarKindInfo> = {
  match: {
    label: "Match completo",
    description: "Alguém quer o meu carro e eu quero o deles.",
    prompt: "Os dois lados se querem: o anúncio aceita meu carro e tem o carro que procuro.",
    needsHave: true,
    needsWant: true,
  },
  inbound: {
    label: "Quem quer meu carro",
    description: "Alguém aceita o meu carro na troca.",
    prompt: "Apareceu um anúncio que aceita o carro que eu já tenho.",
    needsHave: true,
    needsWant: false,
  },
  outbound: {
    label: "O carro que eu quero",
    description: "Apareceu o carro que eu procuro.",
    prompt: "Apareceu um anúncio com o carro que eu quero, mesmo sem aceitar o meu.",
    needsHave: false,
    needsWant: true,
  },
};

export const RADAR_KINDS: RadarKind[] = ["match", "inbound", "outbound"];

/** The API refuses the 11th radar: a watch list stops being useful when long. */
export const MAX_RADARS_PER_USER = 10;

export function isRadarKind(value: unknown): value is RadarKind {
  return (
    value === "match" || value === "inbound" || value === "outbound"
  );
}

/**
 * A brand/model pair that no listing can have.
 *
 * `previewMatches` needs both halves to answer. When a radar only watches one
 * direction, the missing half is filled with this sentinel so the direction we
 * do not care about is always false. It also makes the two "union" cases below
 * correct for vehicle-type-only listings, which ignore brand.
 */
const IMPOSSIBLE_BRAND = "\u0000radar-impossible";
const IMPOSSIBLE_CAR: PreviewCar = {
  brand: IMPOSSIBLE_BRAND,
  model: IMPOSSIBLE_BRAND,
};
const IMPOSSIBLE_WANT: PreviewWant = {
  brand: IMPOSSIBLE_BRAND,
  model: IMPOSSIBLE_BRAND,
};

/**
 * Current listings that satisfy a radar.
 *
 * Direction rules come straight from `previewMatches`, which classifies every
 * listing as reciprocal / inbound-only / outbound-only. A radar that watches
 * one direction is the union of that direction's buckets:
 *
 *   inbound  = matches + theyWantMine   (every listing that accepts my car)
 *   outbound = matches + iWantTheirs    (every listing with the car I want)
 *   match    = matches                  (both directions at once)
 *
 * The sentinel keeps the opposite bucket empty, so the union cannot leak a
 * listing that only matched the direction the radar ignores.
 */
export function evaluateRadar(radar: Radar, posts: CarPost[]): RadarEvaluation {
  // Your own listings are never a signal for you: "alguém quer meu carro"
  // must not count the car you already published yourself.
  const candidates = posts.filter((p) => p.userId !== radar.userId);

  const have = radar.have ?? IMPOSSIBLE_CAR;
  const want = radar.want ?? IMPOSSIBLE_WANT;

  const preview = previewMatches(candidates, {
    have: {
      brand: have.brand,
      model: have.model,
      year: have.year,
      estimatedValue: have.estimatedValue,
    },
    want: {
      brand: want.brand,
      model: want.model,
      yearMin: want.yearMin,
      yearMax: want.yearMax,
    },
    city: radar.city,
    radiusKm: radar.radiusKm,
  });

  let hits: CarPost[];
  switch (radar.kind) {
    case "inbound":
      hits = [...preview.matches, ...preview.theyWantMine];
      break;
    case "outbound":
      hits = [...preview.matches, ...preview.iWantTheirs];
      break;
    case "match":
      // A malformed radar (stored before validation, or hand-edited JSON)
      // degrades to the direction it can still answer instead of throwing.
      if (radar.have && radar.want) hits = preview.matches;
      else if (radar.have) hits = [...preview.matches, ...preview.theyWantMine];
      else hits = [...preview.matches, ...preview.iWantTheirs];
      break;
  }

  // Same value-first ordering the wizard uses, so "the best one" means the
  // same thing in the alert and in the preview screen.
  hits.sort((a, b) => b.car.estimatedValue - a.car.estimatedValue);

  return { hits, total: hits.length };
}

/* ─── Naming ───────────────────────────────────────────────────── */

const MAX_NAME = 70;

function shortName(car: { brand: string; model: string; year?: number }): string {
  const model = car.model.split(" ").slice(0, 3).join(" ");
  return `${car.brand} ${model}${car.year ? ` ${car.year}` : ""}`.trim();
}

function truncate(text: string, max = MAX_NAME): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * A readable default name, derived from what the radar watches.
 *
 * Users can rename it; nobody wants to type a name for a saved search.
 */
export function defaultRadarName(
  kind: RadarKind,
  have?: RadarHave,
  want?: RadarWant
): string {
  if (have && want) {
    return truncate(`${shortName(have)} → ${shortName(want)}`);
  }
  if (have) return truncate(`${RADAR_KIND_INFO.inbound.label}: ${shortName(have)}`);
  if (want) return truncate(`${RADAR_KIND_INFO.outbound.label}: ${shortName(want)}`);
  return truncate(RADAR_KIND_INFO[kind].label);
}

/** "Honda Fit 2014 · Toyota Corolla 2019-2024" — one line for a card. */
export function describeRadar(radar: Radar): string {
  const parts: string[] = [];
  if (radar.have) parts.push(`Tenho: ${shortName(radar.have)}`);
  if (radar.want) {
    const years =
      radar.want.yearMin || radar.want.yearMax
        ? ` ${radar.want.yearMin ?? "…"}-${radar.want.yearMax ?? "…"}`
        : "";
    parts.push(
      `Quero: ${radar.want.brand} ${radar.want.model.split(" ").slice(0, 3).join(" ")}${years}`
    );
  }
  if (radar.city) {
    parts.push(
      radar.radiusKm ? `${radar.city} · até ${radar.radiusKm} km` : radar.city
    );
  }
  return parts.join(" · ");
}

/* ─── Alert message ────────────────────────────────────────────── */

/**
 * The WhatsApp text the user would receive.
 *
 * Only what was actually computed: the number of hits, the best one, and a
 * link. No "novos anúncios" claim when the list is empty, no invented urgency.
 * The user's own WhatsApp number is the recipient because the product has no
 * WhatsApp Business API to send from — see `app/api/radars/[id]/evaluate`.
 */
export function buildAlertMessage(
  radar: Radar,
  hits: CarPost[],
  origin: string
): string {
  const base = origin.replace(/\/$/, "");
  const radarUrl = `${base}/radar`;
  const kindLine = RADAR_KIND_INFO[radar.kind].description;

  if (hits.length === 0) {
    return [
      `Radar "${radar.name}": nenhum anúncio novo agora.`,
      kindLine,
      "",
      `Continuo de olho. Seus alertas: ${radarUrl}`,
    ].join("\n");
  }

  const best = hits[0];
  const count = hits.length === 1 ? "1 anúncio" : `${hits.length} anúncios`;
  const price = `R$ ${formatBRL(best.car.estimatedValue)}`;
  const where = best.car.localization ? ` · ${best.car.localization}` : "";

  return [
    `Radar "${radar.name}": ${count} no seu radar.`,
    kindLine,
    "",
    `Melhor opção: ${shortCarName(best.car)}`,
    `${price}${where}`,
    `${base}/posts/${best.id}`,
    "",
    hits.length > 1 ? `Ver todos: ${radarUrl}` : `Ver os alertas: ${radarUrl}`,
  ].join("\n");
}

/* ─── Input validation ─────────────────────────────────────────── */

export interface RadarDraft {
  name?: string;
  kind: RadarKind;
  have?: RadarHave;
  want?: RadarWant;
  city?: string;
  radiusKm?: number;
}

export interface NormalizedRadarDraft {
  name: string;
  kind: RadarKind;
  have?: RadarHave;
  want?: RadarWant;
  city?: string;
  radiusKm?: number;
}

export type RadarValidation =
  | { ok: true; value: NormalizedRadarDraft }
  | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return undefined;
  return text.slice(0, max);
}

function finiteNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function parseHave(value: unknown): RadarHave | null | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = asRecord(value);
  if (!raw) return null;
  const brand = cleanText(raw.brand, 40);
  const model = cleanText(raw.model, 60);
  if (!brand || !model) return null;

  const year = finiteNumber(raw.year);
  const estimatedValue = finiteNumber(raw.estimatedValue);

  return {
    brand,
    model,
    ...(year !== undefined && year > 1900 ? { year: Math.round(year) } : {}),
    ...(estimatedValue !== undefined && estimatedValue >= 0
      ? { estimatedValue }
      : {}),
  };
}

function parseWant(value: unknown): RadarWant | null | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = asRecord(value);
  if (!raw) return null;
  const brand = cleanText(raw.brand, 40);
  const model = cleanText(raw.model, 60);
  if (!brand || !model) return null;

  const yearMin = finiteNumber(raw.yearMin);
  const yearMax = finiteNumber(raw.yearMax);

  return {
    brand,
    model,
    ...(yearMin !== undefined && yearMin > 1900
      ? { yearMin: Math.round(yearMin) }
      : {}),
    ...(yearMax !== undefined && yearMax > 1900
      ? { yearMax: Math.round(yearMax) }
      : {}),
  };
}

/**
 * Validate and canonicalise a create request.
 *
 * Done here (not only in the route) so the form and the endpoint can share one
 * definition of a valid radar, and so junk fields from the request never reach
 * the JSON store.
 */
export function validateRadarDraft(input: unknown): RadarValidation {
  const body = asRecord(input);
  if (!body) return { ok: false, error: "Corpo inválido." };

  if (!isRadarKind(body.kind)) {
    return { ok: false, error: "Escolha o tipo de alerta." };
  }
  const kind = body.kind;

  const have = parseHave(body.have);
  if (have === null) {
    return { ok: false, error: "Preencha marca e modelo do carro que você tem." };
  }

  const want = parseWant(body.want);
  if (want === null) {
    return { ok: false, error: "Preencha marca e modelo do carro que você quer." };
  }

  if (!have && !want) {
    return {
      ok: false,
      error: "Informe pelo menos um carro: o que você tem ou o que você procura.",
    };
  }

  const info = RADAR_KIND_INFO[kind];
  if (info.needsHave && !have) {
    return { ok: false, error: "Informe o carro que você já tem." };
  }
  if (info.needsWant && !want) {
    return { ok: false, error: "Informe o carro que você procura." };
  }

  if (
    want?.yearMin !== undefined &&
    want?.yearMax !== undefined &&
    want.yearMin > want.yearMax
  ) {
    return { ok: false, error: "O ano inicial não pode ser maior que o final." };
  }

  const city = cleanText(body.city, 80);

  const radiusRaw = finiteNumber(body.radiusKm);
  if (radiusRaw !== undefined && (radiusRaw < 1 || radiusRaw > 5000)) {
    return { ok: false, error: "A distância deve ficar entre 1 e 5.000 km." };
  }
  const radiusKm = radiusRaw !== undefined ? Math.round(radiusRaw) : undefined;

  const name =
    cleanText(body.name, MAX_NAME) ?? defaultRadarName(kind, have, want);

  return {
    ok: true,
    value: {
      name,
      kind,
      ...(have ? { have } : {}),
      ...(want ? { want } : {}),
      ...(city ? { city } : {}),
      ...(radiusKm !== undefined ? { radiusKm } : {}),
    },
  };
}
