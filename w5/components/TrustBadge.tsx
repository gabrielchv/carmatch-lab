import { levelLabel, type ListingTrust, type TrustLevel } from "@/lib/confianca";

/**
 * Inline shield, exported because /confianca and the dossier panel use the same
 * mark. It lives here rather than in `components/icons.tsx` so the glyph and
 * the badge that means it can never drift apart.
 */
export function ShieldCheckIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3 5 6v6c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/** Hollow variant for the "pending" state: same shape, no check inside. */
export function ShieldOutlineIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3 5 6v6c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-3Z" />
    </svg>
  );
}

/**
 * The trust chip: identity level of the owner + dossier score of the car.
 *
 * Deliberately presentational and free of hooks so the same component renders
 * inside a client card, a server component and the post detail page without
 * hydration concerns. It renders nothing when no trust was computed, which is
 * what keeps older callers (and posts loaded from data without the server
 * enrichment) working unchanged.
 *
 * Colour carries meaning, but the label always says the level in words —
 * colour alone would be unreadable for anyone with low colour vision.
 */
const TONE: Record<TrustLevel, string> = {
  // Navy, like a stamp on a document: the strongest promise the product makes.
  confiavel: "border-brand-200 bg-brand-50 text-brand-700",
  // A lighter, cooler blue: checked, but not the full record.
  verificado: "border-sky-200 bg-sky-50 text-sky-800",
  // Muted: a new account. Not shameful, just not verified yet.
  novo: "border-ink-200 bg-ink-50 text-ink-500",
};

export default function TrustBadge({
  trust,
  size = "sm",
  showDossier = true,
  className = "",
}: {
  trust?: ListingTrust | null;
  size?: "sm" | "md";
  /** The dossier number is the actionable part; hide it only where space is tight. */
  showDossier?: boolean;
  className?: string;
}) {
  if (!trust) return null;

  const sizeClass =
    size === "md"
      ? "gap-1.5 px-2.5 py-1 text-[12px]"
      : "gap-1 px-2 py-0.5 text-[10.5px]";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold ${sizeClass} ${TONE[trust.level]} ${className}`}
      title={`Confiança CarMatch — nível ${levelLabel(trust.level)}, dossiê do veículo ${trust.dossier.score}/100 (${trust.dossier.confirmed} de ${trust.dossier.total} itens).`}
      aria-label={`Confiança: nível ${levelLabel(trust.level)}, dossiê ${trust.dossier.score} de 100`}
    >
      <ShieldCheckIcon size={size === "md" ? 13 : 11} />
      <span>{levelLabel(trust.level)}</span>
      {showDossier && (
        <>
          <span aria-hidden className="opacity-50">
            ·
          </span>
          <span className="font-medium">dossiê {trust.dossier.score}/100</span>
        </>
      )}
    </span>
  );
}
