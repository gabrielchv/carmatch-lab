import { formatBRL } from "@/lib/cash";
import { KM_PER_YEAR, PRECO_DISCLAIMER, type Valuation } from "@/lib/preco";
import { ChevronDownIcon } from "./icons";

/**
 * The price breakdown — the product itself.
 *
 * Every place that shows a fair value must be able to show WHY, so this is
 * shared by the listing panel and the calculator. The totals deliberately
 * come from `valuation.fairValue` (which is the sum of these lines), never
 * from a second calculation.
 */
export default function PrecoBreakdown({
  valuation,
  defaultOpen = false,
  summary = "Como chegamos nesse número",
}: {
  valuation: Valuation;
  /** The calculator opens it by default: there the breakdown IS the result. */
  defaultOpen?: boolean;
  summary?: string;
}) {
  return (
    <details
      className="group border-t border-ink-100"
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[12px] font-semibold text-ink-700 transition-colors hover:bg-ink-50/70 [&::-webkit-details-marker]:hidden">
        {summary}
        <ChevronDownIcon
          size={14}
          className="shrink-0 text-ink-400 transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="px-4 pb-4">
        <ul className="space-y-1.5">
          {valuation.breakdown.map((line) => (
            <li
              key={line.key}
              className="flex items-start justify-between gap-3 text-[11.5px]"
            >
              <span className="flex-1 leading-snug text-ink-600">
                {line.reason}
              </span>
              <span
                className={`shrink-0 font-medium tabular-nums ${
                  line.impactBRL > 0
                    ? "text-emerald-700"
                    : line.impactBRL < 0
                      ? "text-rose-600"
                      : "text-ink-400"
                }`}
              >
                {line.impactBRL === 0
                  ? "—"
                  : `${line.impactBRL > 0 ? "+" : "−"} R$ ${formatBRL(
                      Math.abs(line.impactBRL)
                    )}`}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-2 flex items-center justify-between border-t border-ink-200 pt-2 text-[11.5px] font-semibold text-ink-900">
          <span>Total justo</span>
          <span className="tabular-nums">R$ {formatBRL(valuation.fairValue)}</span>
        </div>

        <p className="mt-2 text-[10.5px] leading-relaxed text-ink-400">
          {PRECO_DISCLAIMER} Uso esperado:{" "}
          {KM_PER_YEAR.toLocaleString("pt-BR")} km/ano.
        </p>
      </div>
    </details>
  );
}
