/**
 * WhatsApp is the only communication channel in this generation of CarMatch.
 *
 * There is no in-app chat: every contact is a `wa.me` deep link that opens the
 * user's WhatsApp with a message already written. That removes an entire
 * server-side subsystem (conversations, messages, polling, unread counters)
 * and puts the negotiation where Brazilians actually negotiate.
 *
 * Everything here is pure so both server routes and client components can use
 * it without pulling in the filesystem.
 */

import type { CarPost, Match } from "./types";
import { formatBRL } from "./cash";

/* ─── Numbers ──────────────────────────────────────────────────── */

/**
 * Keep only digits and normalise to the international form WhatsApp expects.
 *
 * Brazilian numbers arrive in every shape: "(11) 91234-5678", "11912345678",
 * "+55 11 91234-5678", "011 91234 5678". We accept a mobile (11 digits:
 * DDD + 9 + 8 digits) or a landline (10 digits) and prepend 55 when the
 * country code is missing.
 *
 * Returns null for anything that cannot be a Brazilian number, so callers can
 * show a real validation error instead of storing garbage.
 */
export function normalizeWhatsapp(input: string): string | null {
  if (!input) return null;

  let digits = String(input).replace(/\D/g, "");
  if (!digits) return null;

  // Drop a leading zero from trunk-prefixed dialling ("011...").
  while (digits.startsWith("0") && digits.length > 11) {
    digits = digits.slice(1);
  }

  // Already international: 55 + 10 or 11 digits.
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return "+" + digits;
  }

  // National: 10 (landline) or 11 (mobile) digits.
  if (digits.length === 10 || digits.length === 11) {
    return "+55" + digits;
  }

  return null;
}

/** Digits only, as `wa.me` expects (no plus, no punctuation). */
export function whatsappDigits(phone: string): string {
  return String(phone).replace(/\D/g, "");
}

/** "+5511912345678" -> "+55 (11) 91234-5678" */
export function formatWhatsapp(phone: string): string {
  const digits = whatsappDigits(phone);
  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return phone;
}

/* ─── Messages ─────────────────────────────────────────────────── */

export interface MatchMessageInput {
  /** First name of the person receiving the message. */
  recipientName?: string;
  /** The sender's car (what they bring to the trade). */
  myCar: CarPost["car"];
  /** The recipient's car (what the sender wants). */
  theirCar: CarPost["car"];
  /** Public URL of the sender's listing. */
  myPostUrl: string;
  /** Positive = the sender pays the difference. */
  cashFromMe: number;
  /** 0-100 match score, shown only when it is meaningful. */
  score?: number;
}

export interface InterestMessageInput {
  recipientName?: string;
  myCar?: CarPost["car"];
  theirCar: CarPost["car"];
  myPostUrl?: string;
}

const firstName = (name?: string) => (name ? name.trim().split(/\s+/)[0] : "");

/**
 * Sentence describing the cash adjustment from the sender's point of view.
 * Kept separate because "quem paga" is the single most confusable detail in a
 * swap, and it appears in the message, the UI and the match card.
 */
export function cashSentence(cashFromMe: number): string {
  if (cashFromMe === 0) return "Troca direta, sem dinheiro na diferença.";
  return cashFromMe > 0
    ? `Eu pago R$ ${formatBRL(cashFromMe)} de diferença.`
    : `Você me paga R$ ${formatBRL(Math.abs(cashFromMe))} de diferença.`;
}

/** "Honda Fit EX 1.5 (2014)" — short enough to read on a phone. */
export function shortCarName(car: CarPost["car"]): string {
  const model = car.model.split(" ").slice(0, 3).join(" ");
  return `${car.brand} ${model} (${car.year})`;
}

/**
 * The message used when there is a real match between the two listings.
 *
 * This is the product's handshake: it states that a match exists, shows the
 * sender's car with a link, names the car the sender accepts, and states who
 * pays the difference. The recipient can verify every claim on the site.
 */
export function buildMatchMessage({
  recipientName,
  myCar,
  theirCar,
  myPostUrl,
  cashFromMe,
  score,
}: MatchMessageInput): string {
  const name = firstName(recipientName);
  const greeting = name ? `Oi, ${name}!` : "Oi!";
  const scoreLine =
    score && score > 0 ? `\nCompatibilidade: ${score}%` : "";

  return [
    `${greeting} Demos match no CarMatch 🚗↔️`,
    "",
    `Meu carro: ${shortCarName(myCar)}`,
    myPostUrl,
    "",
    `Aceito seu ${shortCarName(theirCar)} como negócio.`,
    cashSentence(cashFromMe) + scoreLine,
    "",
    "Vamos fazer negócio?",
  ].join("\n");
}

/**
 * The message used when the sender has no reciprocal match — they just want
 * the car. Shorter and humbler, because there is no match to point at.
 */
export function buildInterestMessage({
  recipientName,
  myCar,
  theirCar,
  myPostUrl,
}: InterestMessageInput): string {
  const name = firstName(recipientName);
  const greeting = name ? `Oi, ${name}!` : "Oi!";
  const mine = myCar ? `Tenho um ${shortCarName(myCar)} e topo trocar.` : "Tenho interesse em trocar.";

  return [
    `${greeting} Vi seu ${shortCarName(theirCar)} no CarMatch.`,
    mine,
    myPostUrl ? `Meu anúncio: ${myPostUrl}` : "",
    "",
    "Podemos conversar?",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * Build the `wa.me` URL. `phone` may be any format; it is normalised first.
 * Returns null when the number is unusable, so the UI can disable the button
 * instead of opening a broken link.
 */
export function whatsappLink(phone: string, message: string): string | null {
  const normalized = normalizeWhatsapp(phone);
  if (!normalized) return null;
  const digits = whatsappDigits(normalized);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Absolute URL for a post, given the request origin. */
export function postUrl(origin: string, postId: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/posts/${postId}`;
}

/**
 * Direction of `match.suggestedCashFromA` from the viewer's side.
 * Positive means the viewer pays. Mirrors `lib/cash.ts`.
 */
export function cashFromViewer(match: Match, viewerPostId: string): number {
  return match.postAId === viewerPostId
    ? match.suggestedCashFromA
    : -match.suggestedCashFromA;
}
