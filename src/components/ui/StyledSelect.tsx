"use client";
// Styled single-select picker — the design-system answer to the native <select>.
// Same paper-card popover language as ClientPicker (search, active highlight,
// sage check), but generic: pass options, optional avatars, and an optional
// "none" row. Used wherever a native dropdown would break the editorial look
// (linked proposal, crew assignment, …).

import * as React from "react";
import { ChevronDown, Search, X, Check } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";

export interface StyledSelectOption {
  id: string;
  label: string;
  sublabel?: string | null;
}

interface StyledSelectProps {
  options: StyledSelectOption[];
  value: string; // selected id; "" = none
  onChange: (id: string) => void;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Shown when there are no options at all. */
  emptyText?: string;
  /** Label for the clear/"none" row; pass null to omit it (e.g. an add-to-list picker). */
  noneLabel?: string | null;
  /** Render an avatar from each option's label (people pickers). */
  avatars?: boolean;
  /**
   * Which edge the popover anchors to. Default "left" opens rightward — correct
   * for a wide trigger. Use "right" for a narrow trigger pinned to the right of
   * its row (e.g. a compact State field): the min-260px panel then opens leftward
   * and stays inside the container instead of overflowing the page edge.
   */
  align?: "left" | "right";
}

export function StyledSelect({
  options,
  value,
  onChange,
  label,
  placeholder = "— None —",
  searchPlaceholder = "Search…",
  emptyText = "Nothing here yet.",
  noneLabel = "— None —",
  avatars = false,
  align = "left",
}: StyledSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const id = React.useId();

  const selected = options.find((o) => o.id === value) ?? null;
  // Search only earns its place on longer lists; a 3-worker crew doesn't need it.
  const showSearch = options.length > 6;

  React.useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    // preventScroll: a right-pinned popover can sit partly past the viewport edge;
    // a plain focus() would make the browser scroll the page sideways to reveal
    // the search box, yanking the whole form. We never want that jump.
    const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.sublabel ?? "").toLowerCase().includes(q),
    );
  }, [options, query]);

  function pick(nextId: string) {
    onChange(nextId);
    setQuery("");
    setOpen(false);
  }

  function toggle() {
    if (open) {
      setOpen(false);
    } else {
      setQuery("");
      setOpen(true);
    }
  }

  return (
    <div className="relative flex flex-col gap-1.5" ref={rootRef}>
      {label && (
        <label htmlFor={id} className="quiet-caps">
          {label}
        </label>
      )}

      <button
        id={id}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-[var(--r-md)] bg-white/60 pl-3 pr-2.5 text-left transition-all hairline",
          open ? "bg-white/90 shadow-[0_0_0_3px_rgba(31,122,82,0.18)]" : "hover:bg-white/85",
        )}
      >
        {selected ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {avatars && <Avatar name={selected.label} size={20} />}
            <span className="truncate text-sm text-[color:var(--ink)]">{selected.label}</span>
          </span>
        ) : (
          <span className="flex-1 truncate text-sm text-[color:var(--ink-faint)]">{placeholder}</span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            open ? "text-[color:var(--accent)]" : "text-[color:var(--ink-muted)]",
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            "paper-card absolute top-[calc(100%+6px)] z-50 w-full min-w-[260px] overflow-hidden",
            align === "right" ? "right-0" : "left-0",
          )}
          style={{
            boxShadow: "0 28px 56px -12px rgba(17,17,19,0.22), 0 2px 0 rgba(31,122,82,0.06)",
            borderRadius: "var(--r-lg)",
          }}
        >
          {showSearch && (
            <div className="border-b border-[color:var(--ink-line)] p-2">
              <div className="flex h-9 items-center gap-2 rounded-[var(--r-md)] bg-white/60 px-2.5 hairline focus-within:shadow-[0_0_0_3px_rgba(31,122,82,0.18)]">
                <Search className="h-3.5 w-3.5 shrink-0 text-[color:var(--ink-muted)]" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    // Keep Enter inside the picker — never submit the host form.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (filtered.length > 0) pick(filtered[0].id);
                    }
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full bg-transparent text-[13px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-faint)]"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.05]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          <ul className="max-h-[248px] overflow-y-auto py-1">
            {noneLabel !== null && (
              <li>
                <button
                  type="button"
                  onClick={() => pick("")}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-left transition-colors focus:outline-none",
                    !selected
                      ? "bg-[color:var(--accent-soft)]"
                      : "hover:bg-black/[0.03] focus-visible:bg-black/[0.04]",
                  )}
                >
                  <span className="text-[13px] text-[color:var(--ink-muted)]">{noneLabel}</span>
                  {!selected && <Check className="h-3.5 w-3.5 shrink-0 text-[color:var(--accent)]" />}
                </button>
              </li>
            )}

            {options.length === 0 ? (
              <li className="px-3 py-3 text-[11px] text-[color:var(--ink-muted)]">{emptyText}</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-3 text-[11px] text-[color:var(--ink-muted)]">
                Nothing matches that search.
              </li>
            ) : (
              filtered.map((o) => {
                const active = o.id === value;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => pick(o.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors focus:outline-none",
                        active
                          ? "bg-[color:var(--accent-soft)]"
                          : "hover:bg-black/[0.03] focus-visible:bg-black/[0.04]",
                      )}
                    >
                      {avatars && <Avatar name={o.label} size={26} />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-[color:var(--ink)]">
                          {o.label}
                        </span>
                        {o.sublabel && (
                          <span className="block truncate text-[11px] text-[color:var(--ink-muted)]">
                            {o.sublabel}
                          </span>
                        )}
                      </span>
                      {active && <Check className="h-3.5 w-3.5 shrink-0 text-[color:var(--accent)]" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
