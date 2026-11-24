"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { ChevronDownIcon, SearchIcon, SlidersIcon } from "./icons";

const SORT_OPTIONS = [
  { label: "Mais recentes", sortBy: "date", sortOrder: "desc" },
  { label: "Mais antigos", sortBy: "date", sortOrder: "asc" },
  { label: "Maior valor", sortBy: "value", sortOrder: "desc" },
  { label: "Menor valor", sortBy: "value", sortOrder: "asc" },
  { label: "Mais novo (ano)", sortBy: "year", sortOrder: "desc" },
  { label: "Menos rodado", sortBy: "mileage", sortOrder: "asc" },
];

export default function FilterBar({
  onToggleFilters,
}: {
  onToggleFilters?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(searchParams.get("q") || "");
  const [showSortMenu, setShowSortMenu] = useState(false);

  const currentSortBy = searchParams.get("sortBy") || "date";
  const currentSortOrder = searchParams.get("sortOrder") || "desc";

  const applyParams = (mutate: (p: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    // Any filter change resets pagination — page 3 of the old result set is
    // never what someone means after narrowing the search.
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  };

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    applyParams((p) => {
      const value = q.trim();
      if (value) p.set("q", value);
      else p.delete("q");
    });
  };

  const handleSort = (sortBy: string, sortOrder: string) => {
    applyParams((p) => {
      p.set("sortBy", sortBy);
      p.set("sortOrder", sortOrder);
    });
    setShowSortMenu(false);
  };

  const currentSortLabel =
    SORT_OPTIONS.find(
      (o) => o.sortBy === currentSortBy && o.sortOrder === currentSortOrder
    )?.label || "Mais recentes";

  const sortDropdown = (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowSortMenu(!showSortMenu)}
        aria-haspopup="listbox"
        aria-expanded={showSortMenu}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-[12.5px] font-medium text-ink-700 transition-colors hover:border-ink-300 hover:bg-ink-50"
      >
        <span className="text-ink-400">Ordenar:</span>
        {currentSortLabel}
        <ChevronDownIcon size={13} />
      </button>

      {showSortMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowSortMenu(false)}
            aria-hidden
          />
          <div
            role="listbox"
            className="absolute right-0 z-20 mt-1 min-w-[190px] overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-lg"
          >
            {SORT_OPTIONS.map((opt) => {
              const active =
                opt.sortBy === currentSortBy && opt.sortOrder === currentSortOrder;
              return (
                <button
                  key={opt.label}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => handleSort(opt.sortBy, opt.sortOrder)}
                  className={`block w-full px-3.5 py-2 text-left text-[12.5px] transition-colors hover:bg-ink-50 ${
                    active ? "font-semibold text-brand-600" : "text-ink-700"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  return (
    // Stacks until `lg`, where the sidebar appears and the row finally has
    // room. At `sm` the sort control used to run off the right edge.
    <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-ink-200 bg-white p-2.5 lg:flex-row lg:items-center">
      <form onSubmit={handleSearch} className="flex min-w-0 flex-1 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="input-field !py-2.5 !pl-9"
            placeholder="Buscar por marca, modelo ou cidade..."
            aria-label="Buscar anúncios"
          />
        </div>
        <button type="submit" className="btn-primary !py-2.5 shrink-0">
          Buscar
        </button>
      </form>

      <div className="flex items-center gap-2">
        {onToggleFilters && (
          <button
            type="button"
            onClick={onToggleFilters}
            className="btn-ghost !py-2.5 lg:hidden"
          >
            <SlidersIcon size={14} />
            Filtros
          </button>
        )}
        <div className="ml-auto">{sortDropdown}</div>
      </div>
    </div>
  );
}
