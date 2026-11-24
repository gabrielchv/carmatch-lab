import { NextResponse } from "next/server";
import { readData } from "@/lib/db";
import { previewMatches, type PreviewInput } from "@/lib/onboarding";
import type { CarPost } from "@/lib/types";

/**
 * Public on-demand match preview for the onboarding wizard.
 *
 * Deliberately does not create anything: it answers "if I had this car and
 * wanted that one, what do I get today?" so a first-time visitor can see the
 * value of the site before signing up.
 *
 * `want` is optional. Without it the answer is only "who accepts my car",
 * which is a complete question and the one that decides whether publishing is
 * worth the effort.
 */
export async function POST(request: Request) {
  let body: Partial<PreviewInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const have = body.have;
  const want = body.want;

  if (!have || !have.brand || !have.model) {
    return NextResponse.json(
      { error: "Informe o carro que você tem." },
      { status: 400 }
    );
  }

  // A want that was sent but is incomplete is a real error — silently treating
  // it as "none" would show the user trusted results for a question they did
  // answer.
  if (want && (!want.brand || !want.model)) {
    return NextResponse.json(
      { error: "Informe marca e modelo do carro que você quer, ou deixe em branco." },
      { status: 400 }
    );
  }

  // Price band: an alternative answer to "what do you want". At least one bound
  // must be usable, otherwise it is not a question at all.
  const rawRange = body.wantRange;
  let wantRange: { min?: number; max?: number } | undefined;
  if (rawRange && (rawRange.min !== undefined || rawRange.max !== undefined)) {
    const min = Number(rawRange.min);
    const max = Number(rawRange.max);
    const hasMin = Number.isFinite(min) && min > 0;
    const hasMax = Number.isFinite(max) && max > 0;

    if (!hasMin && !hasMax) {
      return NextResponse.json(
        { error: "Informe um valor mínimo ou máximo para a faixa." },
        { status: 400 }
      );
    }
    if (hasMin && hasMax && min > max) {
      // Trocar os dois em silêncio esconderia um erro de digitação.
      return NextResponse.json(
        { error: "O valor mínimo não pode ser maior que o máximo." },
        { status: 400 }
      );
    }
    wantRange = { min: hasMin ? min : undefined, max: hasMax ? max : undefined };
  }

  const posts = readData<CarPost>("posts");
  const result = previewMatches(posts, {
    have: {
      brand: String(have.brand),
      model: String(have.model),
      year: Number.isFinite(Number(have.year)) ? Number(have.year) : undefined,
      estimatedValue: Number.isFinite(Number(have.estimatedValue))
        ? Number(have.estimatedValue)
        : undefined,
    },
    want: want
      ? {
          brand: String(want.brand),
          model: String(want.model),
          yearMin: Number.isFinite(Number(want.yearMin)) ? Number(want.yearMin) : undefined,
          yearMax: Number.isFinite(Number(want.yearMax)) ? Number(want.yearMax) : undefined,
        }
      : undefined,
    wantRange,
    city: body.city ? String(body.city) : undefined,
    radiusKm: Number.isFinite(Number(body.radiusKm)) ? Number(body.radiusKm) : undefined,
  });

  return NextResponse.json(result);
}
