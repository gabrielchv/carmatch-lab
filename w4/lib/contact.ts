import type { CarPost, Match } from "./types";
import {
  buildInterestMessage,
  buildMatchMessage,
  cashFromViewer,
  postUrl,
  whatsappLink,
  normalizeWhatsapp,
} from "./whatsapp";

/**
 * Turns "I am looking at this listing" into "here is the WhatsApp message I
 * will send, already written".
 *
 * Pure and shared by the client card/detail components and the API route, so
 * the button and the endpoint can never disagree about what the message says.
 */

export interface ContactResult {
  /** Ready-to-use wa.me link, or null when the owner has no usable number. */
  href: string | null;
  /** True when the two listings actually matched, which changes the copy. */
  matched: boolean;
  message: string;
  /** Why a link could not be produced, for the UI to explain. */
  unavailable?: "no-whatsapp" | "self";
}

export interface BuildContactInput {
  target: CarPost;
  ownerName?: string;
  /** The viewer's own listings. Empty when anonymous. */
  myPosts: CarPost[];
  /** All matches known to the viewer. */
  matches: Match[];
  origin: string;
}

/** The viewer's listing that matched `target`, if any. */
export function findMyMatchWith(
  targetPostId: string,
  myPosts: CarPost[],
  matches: Match[]
): { myPost: CarPost; match: Match } | null {
  const mine = new Map(myPosts.map((p) => [p.id, p]));

  for (const match of matches) {
    const isTargetA = match.postAId === targetPostId;
    const isTargetB = match.postBId === targetPostId;
    if (!isTargetA && !isTargetB) continue;

    const myPostId = isTargetA ? match.postBId : match.postAId;
    const myPost = mine.get(myPostId);
    if (myPost) return { myPost, match };
  }

  return null;
}

export function buildContact({
  target,
  ownerName,
  myPosts,
  matches,
  origin,
}: BuildContactInput): ContactResult {
  const phone = target.contactInfo?.whatsapp ?? "";
  const found = findMyMatchWith(target.id, myPosts, matches);

  // No reciprocal match: send a shorter, honest message. We still name our car
  // when we have one, because that is the first thing the owner will ask.
  if (!found) {
    const myCar = myPosts[0]?.car;
    const message = buildInterestMessage({
      recipientName: ownerName,
      theirCar: target.car,
      myCar,
      myPostUrl: myPosts[0] ? postUrl(origin, myPosts[0].id) : undefined,
    });

    return {
      href: whatsappLink(phone, message),
      matched: false,
      message,
      unavailable: normalizeWhatsapp(phone) ? undefined : "no-whatsapp",
    };
  }

  const { myPost, match } = found;
  const message = buildMatchMessage({
    recipientName: ownerName,
    myCar: myPost.car,
    theirCar: target.car,
    myPostUrl: postUrl(origin, myPost.id),
    cashFromMe: cashFromViewer(match, myPost.id),
    score: match.score,
  });

  return {
    href: whatsappLink(phone, message),
    matched: true,
    message,
    unavailable: normalizeWhatsapp(phone) ? undefined : "no-whatsapp",
  };
}
