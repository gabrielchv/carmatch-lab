/**
 * From onboarding answers to a pre-filled listing.
 *
 * The onboarding ends with "you have matches, but they are temporary". Turning
 * one into a real conversation needs an account and a listing, and asking
 * someone to type their car again after they just told us is where people
 * leave. So the answers travel to the form as a draft: same brand, same FIPE
 * code, same year, same value, and the car they said they want.
 *
 * The draft rides in the query string rather than in localStorage because it
 * has to survive a round-trip through `/auth` (the login redirect), and because
 * a shared or reloaded URL then still opens the same half-filled form.
 *
 * Pure module — the tests assert the round-trip, not the markup.
 */

export interface OnboardingDraft {
  /** Brand as the FIPE list shows it, e.g. "GM - Chevrolet". */
  brand: string;
  brandId?: string;
  /** Full FIPE model name, e.g. "TRACKER LT 1.8 16V Flex 4x2 Aut.". */
  model: string;
  modelCode?: string;
  year?: number;
  /** FIPE reference value for that year, when it was available. */
  value?: number;
  /** The car they said they would accept. */
  wantBrand?: string;
  wantModel?: string;
  wantYear?: number;
}

/** Marks the form as "opened from onboarding" so it can hydrate itself. */
export const DRAFT_FLAG = "fromOnboarding";

export const DRAFT_PATH = "/posts/new";

/**
 * Query string for the pre-filled form.
 *
 * Empty values are omitted rather than serialised as `""`: the form checks
 * presence, and an empty parameter would be read as "the user cleared it".
 */
export function draftParams(draft: OnboardingDraft): URLSearchParams {
  const params = new URLSearchParams();
  params.set(DRAFT_FLAG, "1");

  const put = (key: string, value: string | number | undefined) => {
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (text) params.set(key, text);
  };

  put("brand", draft.brand);
  put("brandId", draft.brandId);
  put("model", draft.model);
  put("modelCode", draft.modelCode);
  put("year", draft.year);
  put("value", draft.value);
  put("wantBrand", draft.wantBrand);
  put("wantModel", draft.wantModel);
  put("wantYear", draft.wantYear);

  return params;
}

/** `/posts/new?fromOnboarding=1&…` */
export function draftUrl(draft: OnboardingDraft): string {
  return `${DRAFT_PATH}?${draftParams(draft).toString()}`;
}

/**
 * Where "finalizar cadastro" goes.
 *
 * Signed in: straight to the form. Signed out: through the login page with the
 * *full draft URL* as the redirect target, so the answers are not lost at the
 * exact moment the person creates the account.
 */
export function officializeUrl(draft: OnboardingDraft, signedIn: boolean): string {
  const target = draftUrl(draft);
  if (signedIn) return target;
  return `/auth?redirectTo=${encodeURIComponent(target)}`;
}

/** Read a draft back out of a query string. Null when it is not one. */
export function readDraft(params: {
  get(key: string): string | null;
}): OnboardingDraft | null {
  if (params.get(DRAFT_FLAG) !== "1") return null;

  const brand = params.get("brand") ?? "";
  const model = params.get("model") ?? "";
  // Without both, there is no car and the form would open empty — better to
  // report "no draft" than to half-fill a form.
  if (!brand || !model) return null;

  const num = (key: string): number | undefined => {
    const raw = params.get(key);
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };

  return {
    brand,
    brandId: params.get("brandId") ?? undefined,
    model,
    modelCode: params.get("modelCode") ?? undefined,
    year: num("year"),
    value: num("value"),
    wantBrand: params.get("wantBrand") || undefined,
    wantModel: params.get("wantModel") || undefined,
    wantYear: num("wantYear"),
  };
}

/**
 * Does this outcome deserve a "register your car" nudge?
 *
 * Only when there is nothing to show — a recursive list of zero. When there are
 * matches (or inbound interest), asking someone to publish instead of talking
 * to the people already there would be moving them away from the answer.
 */
export function shouldEncouragePublishing(outcome: string): boolean {
  return outcome === "no-match" || outcome === "no-posts" || outcome === "outbound-only";
}
