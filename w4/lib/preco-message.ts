/**
 * Preço no WhatsApp — the message must carry the number.
 *
 * The thesis of this variant is that every swap argument is really about ONE
 * number, and WhatsApp is where that number gets stated. The existing
 * `lib/whatsapp.ts` stays untouched (it is the canonical match message); this
 * module *wraps* it and appends a price block with:
 *
 *   1. the fair value of each car (the anchor both sides can check), and
 *   2. the recommended settlement plus one line of justification
 *      ("pelo km e o ano, o justo é R$ X").
 *
 * Direction is the subtle part. `recommendedSplit` uses the same sign
 * convention as `Match.suggestedCashFromA`: positive = A (the sender) pays B.
 * Here A is always the sender's car, so a positive `fromAtoB` means "eu pago".
 * Getting this backwards in a negotiation message is the worst possible bug,
 * which is why the conversion lives in exactly one function.
 */

import type { CarPost, Match } from "./types";
import { formatBRL } from "./cash";
import { recommendedSplit, type CarExtras, type RecommendedSplit } from "./preco";
import {
  buildMatchMessage,
  cashFromViewer,
  postUrl,
  shortCarName,
  whatsappLink,
  type MatchMessageInput,
} from "./whatsapp";

export interface PriceSplitOptions {
  referenceYear?: number;
  /** Owner-declared condition items for the sender's car. */
  myExtras?: CarExtras;
  /** Owner-declared condition items for the recipient's car. */
  theirExtras?: CarExtras;
}

/**
 * The split between "my car" (A) and "their car" (B).
 *
 * Thin wrapper so callers never have to remember that `recommendedSplit`
 * takes `{ car }` objects rather than raw car details.
 */
export function priceSplitFor(
  myCar: CarPost["car"],
  theirCar: CarPost["car"],
  options: PriceSplitOptions = {}
): RecommendedSplit {
  return recommendedSplit(
    { car: myCar },
    { car: theirCar },
    {
      referenceYear: options.referenceYear,
      extrasA: options.myExtras,
      extrasB: options.theirExtras,
    }
  );
}

/**
 * One directional sentence, from the sender's point of view.
 *
 * "Pelo km e o ano, o justo é eu pagar R$ 42.507 de diferença."
 * "Pelo km e o ano, o justo é você me pagar R$ 12.000 de diferença."
 */
export function buildPriceJustification(split: RecommendedSplit): string {
  const amount = Math.abs(split.fromAtoB);

  if (amount === 0) {
    return "Pelo km e o ano, a troca está justa sem diferença.";
  }

  return split.fromAtoB > 0
    ? `Pelo km e o ano, o justo é eu pagar R$ ${formatBRL(amount)} de diferença.`
    : `Pelo km e o ano, o justo é você me pagar R$ ${formatBRL(amount)} de diferença.`;
}

/**
 * The price block appended to a match message: both fair values, then the
 * recommended settlement with its justification.
 */
export function buildPriceBlock(
  myCar: CarPost["car"],
  theirCar: CarPost["car"],
  options: PriceSplitOptions = {}
): string {
  const split = priceSplitFor(myCar, theirCar, options);

  return [
    "Preço justo (heurística)",
    `• Meu ${shortCarName(myCar)}: R$ ${formatBRL(split.valuationA.fairValue)}`,
    `• Seu ${shortCarName(theirCar)}: R$ ${formatBRL(split.valuationB.fairValue)}`,
    buildPriceJustification(split),
  ].join("\n");
}

export interface PriceAwareMatchMessageInput extends MatchMessageInput {
  referenceYear?: number;
  myExtras?: CarExtras;
  theirExtras?: CarExtras;
}

/**
 * The full match message with the price block appended.
 *
 * The original message is preserved verbatim (declared cash adjustment and
 * score included); the price block follows it as a separate, clearly labelled
 * section so the recipient can see both the negotiated number and the
 * heuristic behind it.
 */
export function buildMatchMessageWithPrice({
  referenceYear,
  myExtras,
  theirExtras,
  ...base
}: PriceAwareMatchMessageInput): string {
  return [
    buildMatchMessage(base),
    "",
    buildPriceBlock(base.myCar, base.theirCar, {
      referenceYear,
      myExtras,
      theirExtras,
    }),
  ].join("\n");
}

/* ─── One entry point for a matched contact ────────────────────── */

export interface PricedMatchContactInput {
  match: Match;
  /** The viewer's own post (the sender). */
  myPost: CarPost;
  /** The listing being viewed (the recipient). */
  targetPost: CarPost;
  ownerName?: string;
  /** Absolute site origin, so the link is identical on server and client. */
  origin: string;
  referenceYear?: number;
}

/**
 * The priced WhatsApp payload for a real match.
 *
 * Both the contact API (server) and the match card (client) call this, so the
 * message a user sees on the card is byte-for-byte what the endpoint returns —
 * including the settlement and its justification. `lib/contact.ts` stays the
 * canonical *unpriced* builder; this is the Preço layer on top of it.
 */
export function pricedMatchContact({
  match,
  myPost,
  targetPost,
  ownerName,
  origin,
  referenceYear,
}: PricedMatchContactInput): { href: string | null; message: string } {
  const message = buildMatchMessageWithPrice({
    recipientName: ownerName,
    myCar: myPost.car,
    theirCar: targetPost.car,
    myPostUrl: postUrl(origin, myPost.id),
    // `cashFromViewer` already flips `suggestedCashFromA` for the viewer's side;
    // positive means the sender (this user) pays.
    cashFromMe: cashFromViewer(match, myPost.id),
    score: match.score,
    referenceYear,
  });

  return {
    href: whatsappLink(targetPost.contactInfo?.whatsapp ?? "", message),
    message,
  };
}
