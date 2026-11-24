import type { CarPost } from "./types";
import { vehicleMatchesCar } from "./matching";
import { parseLocalization, isInProximity } from "./location-utils";

/**
 * "Would these two trade?" without creating a listing.
 *
 * The onboarding wizard asks for the car you have and the car you want, then
 * shows what exists today. That needs two directional questions per listing:
 *
 *   inbound  — does this listing accept MY car?  (someone wants what I have)
 *   outbound — do I want THIS car?               (I want what they have)
 *
 * A reciprocal pair (both true) is a match; the other two cases are shown
 * separately because they are still useful: "3 people want your car" is a real
 * reason to publish, even before you find the one you want.
 *
 * The rules are the same ones `runMatching` uses. A preview that disagreed with
 * the real matcher would be worse than no preview at all.
 */

export interface PreviewCar {
  brand: string;
  model: string;
  year?: number;
  estimatedValue?: number;
}

export interface PreviewWant {
  brand: string;
  model: string;
  yearMin?: number;
  yearMax?: number;
}

/**
 * "Anything in this price range" as a substitute for naming a car.
 *
 * Plenty of people know their budget but not the model — and naming the wrong
 * model hides listings they would happily take. At least one bound is
 * required; a range with neither is not a question.
 */
export interface PreviewPriceRange {
  min?: number;
  max?: number;
}

export interface PreviewInput {
  have: PreviewCar;
  /**
   * Optional on purpose. Wanting something specific is not a prerequisite for
   * using the site: "does anyone want the car I already have?" is a complete
   * question on its own, and for someone testing whether to bother publishing
   * it is the only question that matters.
   */
  want?: PreviewWant;
  /**
   * Alternative to `want`: a price band instead of a specific car. Mutually
   * exclusive in practice — the wizard offers one or the other — and if both
   * arrive the car wins, because it is the more specific statement.
   */
  wantRange?: PreviewPriceRange;
  city?: string;
  radiusKm?: number;
}

export interface PreviewListing {
  post: CarPost;
  /** Which direction(s) matched. */
  direction: "reciprocal" | "inbound" | "outbound";
}

export interface PreviewResult {
  /** How many listings were considered after the geographic filter. */
  considered: number;
  /** Listings that match in both directions. */
  matches: CarPost[];
  /** Listings that accept the user's car, but the user does not want them. */
  theyWantMine: CarPost[];
  /** Listings the user wants, but that do not accept the user's car. */
  iWantTheirs: CarPost[];
  /**
   * True when the visitor chose not to name a car they want. The UI uses this
   * to drop every "você quer" affordance rather than showing an empty one.
   */
  wantSkipped: boolean;
  /**
   * How the visitor answered "what do you want". Drives the wording: a price
   * band is not a car, so sentences that name a model would be wrong.
   */
  wantMode: "car" | "price" | "none";
  /** Machine-readable outcome for the UI to branch on. */
  outcome:
    | "no-posts"
    | "no-match"
    | "reciprocal"
    | "inbound-only"
    | "outbound-only";
}

const FALLBACK_YEAR = 2015;

/** Is this listing within the requested area? Unknown location ⇒ keep it. */
function withinArea(post: CarPost, city?: string, radiusKm?: number): boolean {
  if (!city) return true;

  const target = parseLocalization(city);
  if (!target.state) return true;
  if (!post.car.localization) return true; // cannot prove it is far

  // radiusKm <= 0 or undefined means "same state/city, no radius".
  if (radiusKm === undefined || radiusKm === null) {
    const own = parseLocalization(post.car.localization);
    return own.state === target.state;
  }

  return isInProximity(
    post.car.localization,
    target.state,
    target.city || null,
    radiusKm
  );
}

/**
 * Does this listing accept the car the user says they have?
 *
 * When the user does not know the year, the year bounds are dropped before
 * asking — otherwise the placeholder year would silently reject listings the
 * user would in fact accept.
 */
function listingWantsMyCar(post: CarPost, have: PreviewCar): boolean {
  const yearKnown = Number.isFinite(have.year) && (have.year as number) > 0;

  const myCar = {
    brand: have.brand,
    model: have.model,
    year: yearKnown ? (have.year as number) : FALLBACK_YEAR,
    estimatedValue: Number.isFinite(have.estimatedValue)
      ? (have.estimatedValue as number)
      : 0,
  };

  return (post.desiredTrade?.vehicles ?? []).some((want) => {
    const effectiveWant = yearKnown
      ? want
      : { ...want, yearMin: undefined, yearMax: undefined };
    return vehicleMatchesCar(myCar, effectiveWant);
  });
}

/** Does the listing's car satisfy the car the user wants? */
function carSatisfiesWant(post: CarPost, want: PreviewWant): boolean {
  return vehicleMatchesCar(post.car, {
    brand: want.brand,
    model: want.model,
    yearMin: want.yearMin,
    yearMax: want.yearMax,
    cashAdjustment: 0,
    cashAdjustmentTolerance: 0,
  });
}

/**
 * Is this listing's value inside the band?
 *
 * Bounds are inclusive and independent: only a max is a valid answer ("até
 * R$ 80 mil"), and so is only a min. Missing bounds do not constrain.
 */
function priceInRange(value: number, range: PreviewPriceRange): boolean {
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value > range.max) return false;
  return true;
}

/** Either form of "what I want", asked in one place so the loop stays simple. */
function iWantTheirPost(
  post: CarPost,
  want: PreviewWant | undefined,
  range: PreviewPriceRange | undefined
): boolean {
  if (want) return carSatisfiesWant(post, want);
  if (range) return priceInRange(post.car.estimatedValue, range);
  return false;
}

export function previewMatches(
  posts: CarPost[],
  input: PreviewInput
): PreviewResult {
  const active = posts.filter((p) => p.isActive !== false);
  const considered = active.filter((p) =>
    withinArea(p, input.city, input.radiusKm)
  );

  const matches: CarPost[] = [];
  const theyWantMine: CarPost[] = [];
  const iWantTheirs: CarPost[] = [];

  // A car is more specific than a band, so it wins if both are present.
  const activeRange = input.want ? undefined : input.wantRange;
  const wantSkipped = !input.want && !activeRange;
  const wantMode: PreviewResult["wantMode"] = input.want
    ? "car"
    : activeRange
      ? "price"
      : "none";

  for (const post of considered) {
    const inbound = listingWantsMyCar(post, input.have);

    // With no wanted car there is no outbound question to ask. Treating the
    // missing want as "wants nothing" would silently drop every listing, so it
    // is skipped entirely instead: the answer is purely "who wants mine".
    if (wantSkipped) {
      if (inbound) theyWantMine.push(post);
      continue;
    }

    const outbound = iWantTheirPost(post, input.want, activeRange);

    if (inbound && outbound) matches.push(post);
    else if (inbound) theyWantMine.push(post);
    else if (outbound) iWantTheirs.push(post);
  }

  // Best signal first: a newer listing with fewer km is the more attractive one.
  const byValue = (a: CarPost, b: CarPost) =>
    b.car.estimatedValue - a.car.estimatedValue;
  matches.sort(byValue);
  theyWantMine.sort(byValue);
  iWantTheirs.sort(byValue);

  const outcome: PreviewResult["outcome"] =
    considered.length === 0
      ? "no-posts"
      : matches.length > 0
        ? "reciprocal"
        : theyWantMine.length > 0
          ? "inbound-only"
          : iWantTheirs.length > 0
            ? "outbound-only"
            : "no-match";

  return {
    considered: considered.length,
    matches,
    theyWantMine,
    iWantTheirs,
    wantSkipped,
    wantMode,
    outcome,
  };
}
