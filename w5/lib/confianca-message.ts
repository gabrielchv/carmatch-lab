import type { CarPost, User } from "./types";
import { listingTrust, type ListingTrust } from "./confianca";
import {
  buildInterestMessage,
  buildMatchMessage,
  type InterestMessageInput,
  type MatchMessageInput,
} from "./whatsapp";

/**
 * The WhatsApp message, with the sender's trust attached.
 *
 * `lib/whatsapp.ts` owns the copy and must keep working on its own, so it is
 * imported and left untouched. This module wraps its output: same greeting,
 * same car, same cash sentence, plus one honest line about how checked the
 * sender and the car are — inserted right below the listing link, because
 * "dá para verificar no link" only makes sense next to the link.
 *
 * The number is never inflated. A brand-new account says so. Trust that
 * overstates itself is worse than no badge at all.
 */

/**
 * The sentence that travels in the message.
 *
 * Written from the sender's point of view ("Sou nível…") because it is the
 * message they are about to send. `dossiê` is the vehicle score, which is the
 * part a stranger can act on before replying.
 */
export function trustMessageLine(trust: ListingTrust): string {
  const dossier = `dossiê ${trust.dossier.score}/100`;

  switch (trust.level) {
    case "confiavel":
      return `Sou nível confiável no CarMatch (${dossier}) — dá para verificar no link.`;
    case "verificado":
      return `Sou nível verificado no CarMatch (${dossier}) — dá para verificar no link.`;
    default:
      // Nothing to boast about yet: say that plainly instead of dressing up a
      // zero. The recipient can still open the listing and see it is empty of
      // documentary proof — that is the point of showing the score.
      return trust.dossier.confirmed > 0
        ? `Ainda estou completando a verificação no CarMatch (${dossier}) — os detalhes estão no link.`
        : "Meu perfil ainda está em verificação no CarMatch — os detalhes estão no link.";
  }
}

const LINK_LINE = /^https?:\/\//i;

/**
 * Insert the trust line into an already-built message.
 *
 * Placed after the first URL line so the "link" it mentions is the one just
 * above it. When the message has no link (a viewer with no listing of their
 * own), it goes before the closing question instead of dangling at the end.
 * Idempotent, so wrapping a message twice cannot duplicate the line.
 */
export function injectTrustLine(message: string, line: string): string {
  if (!line || message.includes(line)) return message;

  const lines = message.split("\n");
  const linkIndex = lines.findIndex((text) => LINK_LINE.test(text.trim()));

  const next = [...lines];
  if (linkIndex >= 0) {
    // Blank line before and (already present) after: the same rhythm the
    // original message uses between blocks.
    next.splice(linkIndex + 1, 0, "", line);
  } else {
    // Before the final "Podemos conversar?" line, keeping it the last word.
    next.splice(Math.max(next.length - 1, 0), 0, line, "");
  }

  return next.join("\n");
}

/**
 * Wrap any message for a listing with its trust line.
 *
 * `myPost` is the sender's own listing — the source of the score, never the
 * recipient's. Without one there is nothing to cite, so the message is
 * returned exactly as built.
 */
export function applyTrustToMessage(
  message: string,
  myPost: CarPost | null | undefined,
  owner?: User | null
): string {
  if (!myPost) return message;
  return injectTrustLine(message, trustMessageLine(listingTrust(myPost, owner)));
}

/** Match message + trust line. Same inputs as `buildMatchMessage`. */
export function buildTrustedMatchMessage(
  input: MatchMessageInput,
  myPost: CarPost,
  owner?: User | null
): string {
  return applyTrustToMessage(buildMatchMessage(input), myPost, owner);
}

/** Interest message + trust line. Same inputs as `buildInterestMessage`. */
export function buildTrustedInterestMessage(
  input: InterestMessageInput,
  myPost: CarPost | null | undefined,
  owner?: User | null
): string {
  return applyTrustToMessage(buildInterestMessage(input), myPost, owner);
}
