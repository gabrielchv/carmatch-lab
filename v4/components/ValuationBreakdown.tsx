import type { Valuation } from "@/lib/valuation";
import { formatBRL } from "@/lib/cash";

/**
 * The breakdown is the product: every valuation number must be shown with the
 * rows that produced it. Rows are signed amounts in BRL and sum (with the
 * reference row) to the fair value.
 */
export default function ValuationBreakdown({
  valuation,
}: {
  valuation: Valuation;
}) {
  return (
    <div className="space-y-0.5">
      {valuation.breakdown.map((item) => {
        const isBase = item.key === "referencia";
        const positive = item.impactBRL > 0;
        const negative = item.impactBRL < 0;
        return (
          <div
            key={item.key}
            className={`flex items-start justify-between gap-3 rounded-lg px-2.5 py-2 ${
              isBase ? "bg-ink-100/70" : "hover:bg-ink-50"
            }`}
          >
            <div className="flex min-w-0 items-start gap-2">
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  isBase
                    ? "bg-ink-400"
                    : positive
                      ? "bg-emerald-500"
                      : negative
                        ? "bg-rose-500"
                        : "bg-ink-300"
                }`}
                aria-hidden
              />
              <p className="text-[11.5px] leading-snug text-ink-600">
                {item.reason}
              </p>
            </div>
            <span
              className={`shrink-0 font-mono text-[11.5px] font-semibold tabular-nums ${
                isBase
                  ? "text-ink-700"
                  : positive
                    ? "text-emerald-700"
                    : negative
                      ? "text-rose-700"
                      : "text-ink-400"
              }`}
            >
              {isBase
                ? `R$ ${formatBRL(item.impactBRL)}`
                : `${positive ? "+" : negative ? "−" : "±"} R$ ${formatBRL(
                    Math.abs(item.impactBRL)
                  )}`}
            </span>
          </div>
        );
      })}

      <div className="mt-1 flex items-center justify-between border-t border-dashed border-ink-200 px-2.5 pt-2">
        <span className="text-[12px] font-semibold text-ink-800">
          Valor justo
        </span>
        <span className="font-mono text-[12.5px] font-bold tabular-nums text-ink-900">
          R$ {formatBRL(valuation.fairValue)}
        </span>
      </div>
    </div>
  );
}
