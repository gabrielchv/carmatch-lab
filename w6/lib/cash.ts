import type { Match } from "./types";

/**
 * Single source of truth for "who pays whom" in a swap.
 *
 * `Match.suggestedCashFromA` is stored as the amount that leaves post A's
 * owner and arrives at post B's owner (positive = A pays B, negative = B
 * pays A).
 *
 * Every screen has to convert that into a statement about *the person
 * looking at it*, which is easy to invert by accident — the original app
 * did it two different (and both wrong) ways. Keep the conversion here.
 */

/** Cash delta for the viewer: positive = viewer pays, negative = viewer receives. */
export function viewerDelta(match: Match, viewerPostId: string): number {
  return match.postAId === viewerPostId
    ? match.suggestedCashFromA
    : -match.suggestedCashFromA;
}

/** Human sentence: "Você paga R$ 18.826" / "Você recebe R$ 18.826". */
export function viewerCashLabel(match: Match, viewerPostId: string): string {
  const delta = viewerDelta(match, viewerPostId);
  if (delta === 0) return "Troca direta, sem dinheiro";
  return delta > 0
    ? `Você paga R$ ${formatBRL(delta)}`
    : `Você recebe R$ ${formatBRL(Math.abs(delta))}`;
}

/**
 * Neutral phrasing for a post's own ask, independent of the viewer.
 * `ask` is the owner's cashAdjustment: positive = owner adds money.
 */
export function ownerCashLabel(ask: number, tolerance = 0): string {
  if (ask === 0 && tolerance === 0) return "Troca direta, sem dinheiro";
  const base =
    ask > 0
      ? `Paga R$ ${formatBRL(ask)} na troca`
      : ask < 0
        ? `Recebe R$ ${formatBRL(Math.abs(ask))} na troca`
        : "Sem dinheiro na troca";
  return tolerance > 0
    ? `${base} (± R$ ${formatBRL(tolerance)})`
    : base;
}

/** Compact form for cards: "+ R$ 18.826" / "− R$ 18.826" / "troca direta". */
export function shortCashLabel(ask: number): string {
  if (ask === 0) return "troca direta";
  return ask > 0
    ? `+ R$ ${formatBRL(ask)}`
    : `− R$ ${formatBRL(Math.abs(ask))}`;
}

export function formatBRL(value: number): string {
  return Math.round(value).toLocaleString("pt-BR");
}
