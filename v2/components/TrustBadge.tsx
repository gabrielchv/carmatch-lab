import {
  TRUST_LEVEL_LABELS,
  type PostTrustSummary,
  type TrustLevel,
} from "@/lib/trust";
import { ShieldCheckIcon } from "./icons";

/**
 * Compact trust badge reused on listing cards and on the detail page.
 *
 * It shows the owner's level (the person) and the dossier score (the car),
 * because a listing is only as trustworthy as the weaker half. The `title`
 * exposes the exact numbers for pointer users; the visible label stays short
 * so it fits a 16:10 card thumbnail.
 */
const LEVEL_STYLES: Record<TrustLevel, string> = {
  // Dark emerald reads as "bank-approved" and keeps AA contrast on white.
  confiavel: "bg-brand-700 text-white ring-brand-700/20",
  verificado: "bg-brand-50 text-brand-800 ring-brand-300",
  novo: "bg-white text-ink-600 ring-ink-200",
};

export default function TrustBadge({
  trust,
  size = "sm",
  className = "",
  showDossier = true,
}: {
  trust?: PostTrustSummary | null;
  size?: "sm" | "lg";
  className?: string;
  showDossier?: boolean;
}) {
  if (!trust) return null;

  const level = trust.ownerLevel;
  const sizing =
    size === "lg"
      ? "gap-2 px-3 py-1.5 text-[12px]"
      : "gap-1.5 px-2 py-1 text-[10.5px]";

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold shadow-sm ring-1 ${LEVEL_STYLES[level]} ${sizing} ${className}`}
      title={`Vendedor ${TRUST_LEVEL_LABELS[level]} (${trust.ownerScore}/100) · Dossiê do veículo ${trust.dossierScore}/100`}
    >
      <ShieldCheckIcon size={size === "lg" ? 15 : 12} />
      {TRUST_LEVEL_LABELS[level]}
      {showDossier && (
        <span className="font-medium opacity-80">
          · dossiê {trust.dossierScore}
        </span>
      )}
    </span>
  );
}
