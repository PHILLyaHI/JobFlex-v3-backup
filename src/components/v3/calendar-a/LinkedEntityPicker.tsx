"use client";
// Single-select linker for a calendar event → record. It's a combobox: the
// field is a search input; clicking/typing opens a floating dropdown that
// overlays the form (no layout shift) and sits flush under the field. Category
// tabs live INSIDE the dropdown (All + each kind) — the browse list is scoped
// by the active tab, search filters within that scope. Recent items are capped
// so the list stays light; type to reach the rest.

import * as React from "react";
import { Search, X, Check, ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

type BadgeTone = "neutral" | "accent" | "success" | "warn" | "danger" | "info";

export interface EntityOption {
  id: string;
  /** Section key, e.g. "job" | "proposal" | "lead" | "client". */
  kind: string;
  primary: string;
  secondary?: string | null;
  badge?: { label: string; tone: BadgeTone } | null;
}

export interface EntityTab {
  key: string;
  label: string;
}

interface Props {
  label: string;
  tabs: EntityTab[];
  options: EntityOption[];
  /** Selected option id, "" = none. */
  value: string;
  onChange: (option: EntityOption | null) => void;
  placeholder?: string;
  /** Rows shown per scope when browsing (no query). Kept modest for weight. */
  browseCount?: number;
  /** Rows shown when searching. */
  searchCount?: number;
}

export function LinkedEntityPicker({
  label,
  tabs,
  options,
  value,
  onChange,
  placeholder = "Search or choose…",
  browseCount = 20,
  searchCount = 25,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  const selected = options.find((o) => o.id === value) ?? null;
  const allTabs: EntityTab[] = [{ key: "all", label: "All" }, ...tabs];
  const tabLabel = (kind: string) => tabs.find((t) => t.key === kind)?.label ?? kind;

  const q = query.trim().toLowerCase();
  const scoped = tab === "all" ? options : options.filter((o) => o.kind === tab);
  const results = q
    ? scoped
        .filter(
          (o) =>
            o.primary.toLowerCase().includes(q) || (o.secondary ?? "").toLowerCase().includes(q),
        )
        .slice(0, searchCount)
    : scoped.slice(0, browseCount);

  // ── Selected state: compact card + clear ─────────────────────
  if (selected) {
    return (
      <div>
        <div className="quiet-caps mb-1.5">{label}</div>
        <div className="flex items-center gap-2 paper-card px-3 py-2">
          <Avatar name={selected.secondary ?? selected.primary} size={26} />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
              {selected.primary}
            </div>
            <div className="text-[11px] text-[color:var(--ink-muted)] truncate">
              {tabLabel(selected.kind)}
              {selected.secondary ? ` · ${selected.secondary}` : ""}
            </div>
          </div>
          {selected.badge && <Badge tone={selected.badge.tone}>{selected.badge.label}</Badge>}
          <button
            type="button"
            onClick={() => onChange(null)}
            className="h-6 w-6 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.05]"
            aria-label={`Clear ${label.toLowerCase()}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  // ── Empty state: search field + floating dropdown ────────────
  return (
    <div ref={rootRef} className="relative">
      <div className="quiet-caps mb-1.5">{label}</div>

      <div
        className={cn(
          "flex items-center gap-2 h-10 px-3 rounded-[var(--r-md)] hairline bg-white transition-shadow",
          open && "shadow-[0_0_0_3px_rgba(31,122,82,0.18)]",
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-[color:var(--ink-muted)]" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-faint)] outline-none"
        />
        <button
          type="button"
          onClick={() => (open ? close() : setOpen(true))}
          aria-label={open ? "Close" : "Open"}
          className="shrink-0 text-[color:var(--ink-muted)]"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div
          className="absolute z-30 left-0 right-0 top-full mt-1 paper-card p-0 overflow-hidden"
          style={{ boxShadow: "0 28px 56px -12px rgba(17,17,19,0.22), 0 2px 0 rgba(31,122,82,0.06)" }}
        >
          {/* Category tabs — scope the list; "All" spans every kind. */}
          <div className="flex gap-0.5 p-1 border-b border-[color:var(--ink-line)]">
            {allTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex-1 h-7 rounded-[var(--r-sm)] text-[11px] font-medium transition-colors",
                  tab === t.key
                    ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                    : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <ul className="max-h-[264px] overflow-y-auto">
            {results.length === 0 && (
              <li className="px-3 py-3 text-[11px] text-[color:var(--ink-muted)]">
                {q ? "No matches." : "Nothing here yet."}
              </li>
            )}
            {results.map((o) => (
              <li key={`${o.kind}:${o.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o);
                    close();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/[0.02] transition-colors"
                >
                  <Avatar name={o.secondary ?? o.primary} size={22} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium text-[color:var(--ink)] truncate">
                      {o.primary}
                    </div>
                    <div className="text-[10px] text-[color:var(--ink-muted)] truncate">
                      {/* On All (or while searching) the kind tag orients the row. */}
                      {tab === "all" || q ? tabLabel(o.kind) : o.secondary || tabLabel(o.kind)}
                      {(tab === "all" || q) && o.secondary ? ` · ${o.secondary}` : ""}
                    </div>
                  </div>
                  {o.badge && <Badge tone={o.badge.tone}>{o.badge.label}</Badge>}
                  {value === o.id && <Check className="h-3.5 w-3.5 text-[color:var(--accent)]" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
