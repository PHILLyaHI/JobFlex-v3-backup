"use client";
// JobFlex-designed client picker.
//
// Replaces the native <select> for choosing a client. The native option list
// renders the browser's generic gray surface and, worse, shows nothing but the
// name — so several clients sharing a name (e.g. four "Elena Diaz" seed rows)
// are indistinguishable. This is a searchable combobox: each row carries an
// avatar + email so identical names are tellable apart, and the popover is a
// paper-card matching our design language instead of the native dropdown.

import * as React from "react";
import { ChevronDown, Search, X, Check } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";

export interface ClientPickerOption {
  id: string;
  name: string;
  email?: string | null;
}

interface Props {
  clients: ClientPickerOption[];
  value: string; // selected client id; "" means none
  onChange: (id: string) => void;
  label?: string;
  placeholder?: string;
}

export function ClientPicker({
  clients,
  value,
  onChange,
  label,
  placeholder = "— None —",
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const id = React.useId();

  const selected = clients.find((c) => c.id === value) ?? null;

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
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q),
    );
  }, [clients, query]);

  function pick(nextId: string) {
    onChange(nextId);
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
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-[var(--r-md)] bg-white/60 pl-3 pr-2.5 text-left transition-all hairline",
          open ? "bg-white/90 shadow-[0_0_0_3px_rgba(31,122,82,0.18)]" : "hover:bg-white/85",
        )}
      >
        {selected ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Avatar name={selected.name} size={20} />
            <span className="truncate text-sm text-[color:var(--ink)]">{selected.name}</span>
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
          className="paper-card absolute left-0 top-[calc(100%+6px)] z-50 w-full min-w-[260px] overflow-hidden"
          style={{
            boxShadow: "0 28px 56px -12px rgba(17,17,19,0.22), 0 2px 0 rgba(31,122,82,0.06)",
            borderRadius: "var(--r-lg)",
          }}
        >
          <div className="border-b border-[color:var(--ink-line)] p-2">
            <div className="flex h-9 items-center gap-2 rounded-[var(--r-md)] bg-white/60 px-2.5 hairline focus-within:shadow-[0_0_0_3px_rgba(31,122,82,0.18)]">
              <Search className="h-3.5 w-3.5 shrink-0 text-[color:var(--ink-muted)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clients by name or email…"
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

          <ul className="max-h-[248px] overflow-y-auto py-1">
            <li>
              <button
                type="button"
                onClick={() => pick("")}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-left transition-colors focus:outline-none",
                  !selected ? "bg-[color:var(--accent-soft)]" : "hover:bg-black/[0.03] focus-visible:bg-black/[0.04]",
                )}
              >
                <span className="text-[13px] text-[color:var(--ink-muted)]">— None —</span>
                {!selected && <Check className="h-3.5 w-3.5 shrink-0 text-[color:var(--accent)]" />}
              </button>
            </li>

            {clients.length === 0 ? (
              <li className="px-3 py-3 text-[11px] text-[color:var(--ink-muted)]">No clients yet.</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-3 text-[11px] text-[color:var(--ink-muted)]">
                Nothing matches that search.
              </li>
            ) : (
              filtered.map((c) => {
                const active = c.id === value;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => pick(c.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors focus:outline-none",
                        active
                          ? "bg-[color:var(--accent-soft)]"
                          : "hover:bg-black/[0.03] focus-visible:bg-black/[0.04]",
                      )}
                    >
                      <Avatar name={c.name} size={26} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-[color:var(--ink)]">
                          {c.name}
                        </span>
                        {c.email && (
                          <span className="block truncate text-[11px] text-[color:var(--ink-muted)]">
                            {c.email}
                          </span>
                        )}
                      </span>
                      {active && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-[color:var(--accent)]" />
                      )}
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
