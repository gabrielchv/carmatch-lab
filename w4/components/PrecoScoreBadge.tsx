import type { PriceScore } from "@/lib/preco";

const SCORE_STYLES: Record<PriceScore, string> = {
  "abaixo do mercado": "bg-emerald-50 text-emerald-800 ring-emerald-200",
  justo: "bg-brand-50 text-brand-700 ring-brand-200",
  "acima do mercado": "bg-rose-50 text-rose-700 ring-rose-200",
};

/** Shared score chip so the panel, the calculator and the API copy agree. */
export default function PrecoScoreBadge({ score }: { score: PriceScore }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${SCORE_STYLES[score]}`}
    >
      {score}
    </span>
  );
}
