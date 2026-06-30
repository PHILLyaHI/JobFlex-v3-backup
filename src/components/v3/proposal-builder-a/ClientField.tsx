"use client";
import * as React from "react";
import {
  Check,
  ChevronsUpDown,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Type,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { Input } from "@/components/ui/Input";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";
import type { ClientRecord } from "@/actions/clients";
import { ClientFormSheet } from "./ClientFormSheet";

// Full client shape the builder needs — matches createClient/updateClient
// output so an inline edit can round-trip every field.
export type ClientLite = ClientRecord;

function formatLocation(c: ClientLite): string | null {
  const cityState = [c.city, c.state].filter(Boolean).join(", ");
  const parts = [c.address, cityState, c.zip].filter(
    (p): p is string => !!p && p.trim().length > 0,
  );
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Client field with three input modes:
 *   1. Pick an existing client — searchable combobox (Bucket A).
 *   2. Create a new client inline — ClientFormSheet → createClient (Bucket B).
 *   3. Type a one-off free-text name (Bucket C — inert preview, no schema
 *      field exists for it yet).
 * A selected existing client can be edited in place (Bucket B → updateClient).
 */
export function ClientField({ clients }: { clients: ClientLite[] }) {
  const clientId = useProposalDraftStore((s) => s.draft.clientId);
  const set = useProposalDraftStore((s) => s.set);

  // Local list so an inline-created client appears immediately in the picker
  // without waiting for a router refresh. The sync effect keeps it current when
  // the parent re-fetches (e.g. router.refresh after another action). The
  // alternative — read directly from `clients` — defeats the optimistic insert.
  const [clientList, setClientList] = React.useState<ClientLite[]>(clients);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setClientList(clients), [clients]);

  const selected = clientList.find((c) => c.id === clientId) ?? null;

  // Free-text mode (Bucket C): null = not in free-text mode.
  const [freeText, setFreeText] = React.useState<string | null>(null);
  const freeTextMode = freeText !== null && !selected;

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [sheetMode, setSheetMode] = React.useState<"create" | "edit">("create");

  const rootRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clientList;
    return clientList.filter((c) => c.name.toLowerCase().includes(q));
  }, [clientList, query]);

  React.useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  React.useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  function onQueryChange(v: string) {
    setQuery(v);
    setActiveIdx(0);
  }

  function choose(c: ClientLite) {
    set({ clientId: c.id });
    setFreeText(null);
    setOpen(false);
    setQuery("");
  }
  function clearClient() {
    set({ clientId: undefined });
    setQuery("");
  }
  function clearFreeText() {
    setFreeText(null);
  }
  function startCreate() {
    setSheetMode("create");
    setSheetOpen(true);
    setOpen(false);
  }
  function startEdit() {
    if (!selected) return;
    setSheetMode("edit");
    setSheetOpen(true);
  }
  function startFreeText() {
    set({ clientId: undefined });
    setFreeText("");
    setOpen(false);
  }
  function handleSaved(client: ClientRecord) {
    setClientList((list) => {
      const exists = list.some((c) => c.id === client.id);
      return exists
        ? list.map((c) => (c.id === client.id ? client : c))
        : [client, ...list];
    });
    set({ clientId: client.id });
    setFreeText(null);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = filtered[activeIdx];
      if (c) choose(c);
    }
  }

  const location = selected ? formatLocation(selected) : null;

  return (
    <div ref={rootRef} className="relative">
      <span className="quiet-caps">Client</span>

      <div className="mt-1.5">
        {selected ? (
          /* ── Mode 1 selected — inline detail + edit ───────────────── */
          <div className="rounded-[var(--r-md)] bg-white/60 hairline">
            <div className="flex items-start justify-between gap-3 p-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <Avatar name={selected.name} size={34} className="shrink-0" />
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium text-[color:var(--ink)]">
                    {selected.name}
                  </div>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {selected.email && (
                      <span className="flex items-center gap-1.5 text-[12px] text-[color:var(--ink-muted)]">
                        <Mail className="h-3 w-3 shrink-0 text-[color:var(--ink-faint)]" />
                        <span className="truncate">{selected.email}</span>
                      </span>
                    )}
                    {selected.phone && (
                      <span className="flex items-center gap-1.5 text-[12px] tabular text-[color:var(--ink-muted)]">
                        <Phone className="h-3 w-3 shrink-0 text-[color:var(--ink-faint)]" />
                        <span className="truncate">{selected.phone}</span>
                      </span>
                    )}
                    {location && (
                      <span className="flex items-start gap-1.5 text-[12px] text-[color:var(--ink-muted)]">
                        <MapPin className="mt-[1px] h-3 w-3 shrink-0 text-[color:var(--ink-faint)]" />
                        <span>{location}</span>
                      </span>
                    )}
                    {!selected.email && !selected.phone && !location && (
                      <span className="text-[12px] text-[color:var(--ink-faint)]">
                        No contact details on file.
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={startEdit}
                  className="flex h-7 items-center gap-1 rounded-[var(--r-sm)] px-2 text-[11.5px] font-medium text-[color:var(--ink-soft)] hover:bg-black/[0.04] focus-ring"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setOpen((o) => !o)}
                  className="h-7 rounded-[var(--r-sm)] px-2.5 text-[11.5px] font-medium text-[color:var(--ink-soft)] hover:bg-black/[0.04] focus-ring"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={clearClient}
                  aria-label="Remove client"
                  className="grid h-7 w-7 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-[color:var(--rose)] focus-ring"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : freeTextMode ? (
          /* ── Mode 3 free-text (Bucket C inert) ────────────────────── */
          <div>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  aria-label="Client name (free text)"
                  placeholder="Type the client's name"
                  value={freeText ?? ""}
                  onChange={(e) => setFreeText(e.target.value)}
                  prefix={<Type className="h-3.5 w-3.5" />}
                />
              </div>
              <button
                type="button"
                onClick={() => freeText?.trim() && startCreate()}
                disabled={!freeText?.trim()}
                className="h-10 shrink-0 rounded-[var(--r-md)] px-3 text-[12px] font-medium text-[color:var(--ink-soft)] transition-colors hover:bg-black/[0.04] focus-ring disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Save as client
              </button>
              <button
                type="button"
                onClick={clearFreeText}
                aria-label="Exit free-text mode"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] text-[color:var(--ink-muted)] hover:bg-black/[0.04] focus-ring"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* ── No selection — search trigger ────────────────────────── */
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex h-10 w-full items-center gap-2 rounded-[var(--r-md)] bg-white/60 px-3 text-[13px] hairline transition-colors hover:bg-white/80 focus-ring"
          >
            <Search className="h-4 w-4 text-[color:var(--ink-muted)]" />
            <span className="text-[color:var(--ink-faint)]">
              Search clients, create new, or type a name…
            </span>
            <ChevronsUpDown className="ml-auto h-3.5 w-3.5 text-[color:var(--ink-faint)]" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-40 mt-1.5 overflow-hidden rounded-[var(--r-md)] border border-[color:var(--ink-line)] bg-[color:var(--paper)] shadow-[0_20px_48px_-24px_rgba(17,17,19,0.25)]">
          <div className="flex items-center gap-2 border-b border-[color:var(--ink-line)] px-3">
            <Search className="h-4 w-4 shrink-0 text-[color:var(--ink-muted)]" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search by client name…"
              className="h-10 flex-1 bg-transparent text-[13px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-faint)]"
            />
          </div>
          <ul className="max-h-[244px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-7 text-center text-[12px] text-[color:var(--ink-muted)]">
                {clientList.length === 0
                  ? "No clients yet. Create your first one below."
                  : `No clients match “${query}”.`}
              </li>
            ) : (
              filtered.map((c, i) => {
                const loc = formatLocation(c);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => choose(c)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                        i === activeIdx && "bg-black/[0.045]",
                      )}
                    >
                      <Avatar
                        name={c.name}
                        size={28}
                        className="shrink-0 !text-[10px]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-[color:var(--ink)]">
                          {c.name}
                        </span>
                        {loc && (
                          <span className="block truncate text-[11px] text-[color:var(--ink-muted)]">
                            {loc}
                          </span>
                        )}
                      </span>
                      {c.id === clientId && (
                        <Check className="h-4 w-4 shrink-0 text-[color:var(--accent)]" />
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <div className="grid grid-cols-2 border-t border-[color:var(--ink-line)] text-[12px] font-medium text-[color:var(--ink-soft)]">
            <button
              type="button"
              onClick={startCreate}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 transition-colors hover:bg-black/[0.04]"
            >
              <Plus className="h-3.5 w-3.5" />
              Create new
            </button>
            <button
              type="button"
              onClick={startFreeText}
              className="flex items-center justify-center gap-1.5 border-l border-[color:var(--ink-line)] px-3 py-2.5 transition-colors hover:bg-black/[0.04]"
            >
              <Type className="h-3.5 w-3.5" />
              Type as plain text
            </button>
          </div>
        </div>
      )}

      <ClientFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        mode={sheetMode}
        initial={sheetMode === "edit" ? selected : null}
        initialName={
          sheetMode === "create" && freeText ? freeText : undefined
        }
        onSaved={handleSaved}
      />
    </div>
  );
}
