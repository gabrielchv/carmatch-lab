"use client";

import { WhatsAppIcon } from "./icons";

/**
 * The product's only call to action.
 *
 * Renders a plain anchor — `wa.me` links need no JavaScript, work on desktop
 * (WhatsApp Web) and mobile (app), and cannot be blocked by a popup blocker.
 * When no link can be produced we render a disabled control plus the reason,
 * instead of a button that silently does nothing.
 */
export default function WhatsAppButton({
  href,
  label = "Falar no WhatsApp",
  variant = "primary",
  unavailable,
  className = "",
}: {
  href: string | null;
  label?: string;
  variant?: "primary" | "outline" | "compact";
  unavailable?: "no-whatsapp" | "self" | "login-required";
  className?: string;
}) {
  const reason =
    unavailable === "no-whatsapp"
      ? "O anunciante não cadastrou um WhatsApp."
      : unavailable === "self"
        ? "Este anúncio é seu."
        : unavailable === "login-required"
          ? "Entre para falar no WhatsApp."
          : null;

  if (!href) {
    return (
      <span
        title={reason ?? undefined}
        className={`inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-ink-100 px-4 py-2.5 text-sm font-semibold text-ink-400 ${className}`}
      >
        <WhatsAppIcon size={16} />
        {label}
      </span>
    );
  }

  const base =
    "inline-flex items-center justify-center gap-2 font-semibold transition-colors";
  const styles = {
    primary:
      "rounded-lg bg-[#1faa53] px-4 py-2.5 text-sm text-white hover:bg-[#188f45]",
    outline:
      "rounded-lg border border-[#1faa53]/40 bg-white px-3 py-2 text-[12.5px] text-[#128040] hover:bg-[#eefaf2]",
    compact: "rounded-md px-2.5 py-1.5 text-[11.5px] text-white bg-[#1faa53] hover:bg-[#188f45]",
  }[variant];

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base} ${styles} ${className}`}
      aria-label={label}
    >
      <WhatsAppIcon size={variant === "compact" ? 13 : 16} />
      {label}
    </a>
  );
}
