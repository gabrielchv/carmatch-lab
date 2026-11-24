"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
} from "react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  label: string;
  placeholder?: string;
  value?: string;
  options: SelectOption[];
  loading?: boolean;
  onChange: (option: SelectOption | null) => void;
  disabled?: boolean;
  required?: boolean;
}

export default function SearchableSelect({
  label,
  placeholder = "Selecione...",
  value,
  options,
  loading = false,
  onChange,
  disabled = false,
  required = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch("");
        setHighlightedIdx(-1);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Foco no input de busca quando abre
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Rolagem automática do item destacado
  useEffect(() => {
    if (highlightedIdx >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIdx] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIdx]);

  const selectedOption = options.find((o) => o.value === value);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase().trim())
  );

  // Seleciona opção e fecha dropdown
  const selectOption = useCallback(
    (opt: SelectOption) => {
      onChange(opt);
      setOpen(false);
      setSearch("");
      setHighlightedIdx(-1);
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) {
        if (e.key === "ArrowDown" || e.key === "Enter") {
          setOpen(true);
          e.preventDefault();
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIdx((prev) =>
            prev < filtered.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIdx((prev) =>
            prev > 0 ? prev - 1 : filtered.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (filtered[highlightedIdx]) {
            selectOption(filtered[highlightedIdx]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          setSearch("");
          setHighlightedIdx(-1);
          break;
        case "Tab":
          setOpen(false);
          setSearch("");
          setHighlightedIdx(-1);
          break;
      }
    },
    [open, filtered, highlightedIdx, selectOption]
  );

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>

      {/* Gatilho / display */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`w-full border rounded px-3 py-2 text-sm text-left flex items-center justify-between gap-2 transition-colors
          ${
            disabled
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-white hover:border-blue-400 cursor-pointer"
          }
          ${open ? "border-blue-500 ring-1 ring-blue-500" : "border-gray-300"}
        `}
      >
        <span className={selectedOption ? "truncate" : "text-gray-400 truncate"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className={`w-4 h-4 shrink-0 transition-transform text-gray-400 ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 flex flex-col">
          {/* Input de busca */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHighlightedIdx(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Digite para buscar..."
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* Lista de opções */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
                <svg
                  className="animate-spin h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Carregando...
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-sm text-gray-400 text-center">
                {search
                  ? "Nenhum resultado encontrado"
                  : "Nenhuma opção disponível"}
              </p>
            ) : (
              <ul ref={listRef} role="listbox" className="py-1">
                {filtered.map((opt, idx) => (
                  <li
                    key={`${opt.value}__${idx}`}
                    role="option"
                    aria-selected={opt.value === value}
                    className={`px-3 py-2 text-sm cursor-pointer transition-colors
                      ${
                        idx === highlightedIdx
                          ? "bg-blue-50 text-blue-700"
                          : "hover:bg-gray-50"
                      }
                      ${
                        opt.value === value
                          ? "font-medium text-blue-600"
                          : "text-gray-700"
                      }
                    `}
                    onMouseEnter={() => setHighlightedIdx(idx)}
                    onMouseDown={(e) => {
                      // MouseDown antes do blur para evitar perda de foco
                      e.preventDefault();
                      selectOption(opt);
                    }}
                  >
                    {opt.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
