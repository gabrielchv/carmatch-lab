"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CloseIcon, SwapIcon } from "./icons";

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [rodaCount, setRodaCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const router = useRouter();
  const pathname = usePathname();

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = res.ok ? await res.json() : { user: null };

      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser, pathname]);

  // The ring count is cheap (summary mode) and changes whenever a listing is
  // added or removed, so it is refreshed with the same navigation signal as
  // the session. Failures stay silent: a missing badge must not break the nav.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/roda?summary=1")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.count === "number") {
          setRodaCount(data.count);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (mobileMenuOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setMobileMenuOpen(false);
    window.location.href = "/";
  };

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/85 backdrop-blur-md">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-1.5" onClick={closeMenu}>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
            <SwapIcon size={15} />
          </span>
          <span className="text-[15px] font-bold tracking-tight text-ink-900">
            CarMatch <span className="text-brand-600">Roda</span>
          </span>
        </Link>

        {/* Desktop */}
        <div className="hidden items-center gap-5 text-[13px] lg:flex">
          <Link href="/" className="text-ink-600 transition-colors hover:text-brand-600">
            Ver carros
          </Link>
          <Link
            href="/roda"
            className="inline-flex items-center gap-1.5 text-ink-600 transition-colors hover:text-brand-600"
          >
            Roda
            {rodaCount !== null && (
              <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 ring-1 ring-brand-200">
                {rodaCount}
              </span>
            )}
          </Link>

          {loading ? (
            <span className="text-ink-300">···</span>
          ) : user ? (
            <>
              <Link
                href="/posts/new"
                className="text-ink-600 transition-colors hover:text-brand-600"
              >
                Anunciar
              </Link>
              <Link
                href="/my-posts"
                className="text-ink-600 transition-colors hover:text-brand-600"
              >
                Meus anúncios
              </Link>
              <div className="flex items-center gap-2 border-l border-ink-200 pl-4">
                {user.avatar && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatar}
                    alt=""
                    className="h-6 w-6 rounded-full ring-1 ring-ink-200"
                  />
                )}
                <span className="max-w-[110px] truncate text-[12.5px] text-ink-600">
                  {user.name}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-[12.5px] text-ink-400 transition-colors hover:text-red-600"
                >
                  Sair
                </button>
              </div>
            </>
          ) : (
            <Link href="/auth" className="btn-primary !px-3.5 !py-2 !text-[12.5px]">
              Entrar
            </Link>
          )}
        </div>

        {/* Mobile trigger */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="-mr-2 p-2 text-ink-600 lg:hidden"
          aria-label="Abrir menu"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </nav>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/40" onClick={closeMenu} aria-hidden />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[82vw] flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-ink-100 px-4">
              <span className="text-[13px] font-semibold text-ink-700">Menu</span>
              <button
                type="button"
                onClick={closeMenu}
                className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                aria-label="Fechar menu"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
              <MobileLink href="/" onClick={closeMenu}>
                Ver carros
              </MobileLink>
              <MobileLink href="/roda" onClick={closeMenu}>
                <span className="flex items-center justify-between gap-2">
                  Roda
                  {rodaCount !== null && (
                    <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 ring-1 ring-brand-200">
                      {rodaCount}
                    </span>
                  )}
                </span>
              </MobileLink>

              {loading ? (
                <div className="px-3 py-2.5 text-[13px] text-ink-400">Carregando...</div>
              ) : user ? (
                <>
                  <MobileLink href="/posts/new" onClick={closeMenu}>
                    Anunciar carro
                  </MobileLink>
                  <MobileLink href="/my-posts" onClick={closeMenu}>
                    Meus anúncios
                  </MobileLink>
                  <div className="mt-3 border-t border-ink-100 pt-3">
                    <div className="flex items-center gap-2 px-3">
                      {user.avatar && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={user.avatar} alt="" className="h-7 w-7 rounded-full" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium text-ink-800">
                          {user.name}
                        </p>
                        <p className="truncate text-[11px] text-ink-400">{user.email}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="mt-2 w-full rounded-lg px-3 py-2.5 text-left text-[13px] text-red-600 hover:bg-red-50"
                    >
                      Sair
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-2">
                  <Link
                    href="/auth"
                    onClick={closeMenu}
                    className="btn-primary w-full !text-[13px]"
                  >
                    Entrar
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function MobileLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="rounded-lg px-3 py-2.5 text-[13px] text-ink-700 hover:bg-ink-50"
    >
      {children}
    </Link>
  );
}
