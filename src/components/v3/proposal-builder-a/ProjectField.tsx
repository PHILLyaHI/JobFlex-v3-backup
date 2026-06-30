"use client";
import * as React from "react";
import { Check, ChevronsUpDown, FolderOpen, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { ProjectFormSheet, type ProjectRecord } from "./ProjectFormSheet";

interface ProjectFieldProps {
  projects: ProjectRecord[];
  value: string;
  onChange: (id: string) => void;
}

export function ProjectField({ projects, value, onChange }: ProjectFieldProps) {
  const [list, setList] = React.useState<ProjectRecord[]>(projects);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setList(projects), [projects]);

  const selected = list.find((p) => p.id === value) ?? null;
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q));
  }, [list, query]);

  React.useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  React.useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  function choose(p: ProjectRecord) {
    onChange(p.id);
    setOpen(false);
    setQuery("");
  }

  function clear() {
    onChange("");
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const p = filtered[activeIdx]; if (p) choose(p); }
  }

  function handleSaved(project: ProjectRecord) {
    setList((prev) => {
      const exists = prev.some((p) => p.id === project.id);
      return exists ? prev : [project, ...prev];
    });
    onChange(project.id);
  }

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1.5">
      <label className="quiet-caps">Project</label>

      <div>
        {selected ? (
          <div className="flex items-center justify-between gap-2 rounded-[var(--r-md)] bg-white/60 hairline px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[color:var(--accent)]" />
              <span className="truncate text-[13px] font-medium text-[color:var(--ink)]">{selected.name}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="h-7 rounded-[var(--r-sm)] px-2.5 text-[11.5px] font-medium text-[color:var(--ink-soft)] hover:bg-black/[0.04] focus-ring"
              >
                Change
              </button>
              <button
                type="button"
                onClick={clear}
                aria-label="Remove project"
                className="grid h-7 w-7 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-[color:var(--rose)] focus-ring"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex h-10 w-full items-center gap-2 rounded-[var(--r-md)] bg-white/60 px-3 text-[13px] hairline transition-colors hover:bg-white/80 focus-ring"
          >
            <Search className="h-4 w-4 text-[color:var(--ink-muted)]" />
            <span className="text-[color:var(--ink-faint)]">Search projects or create new…</span>
            <ChevronsUpDown className="ml-auto h-3.5 w-3.5 text-[color:var(--ink-faint)]" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-[var(--r-md)] border border-[color:var(--ink-line)] bg-[color:var(--paper)] shadow-[0_20px_48px_-24px_rgba(17,17,19,0.25)]">
          <div className="flex items-center gap-2 border-b border-[color:var(--ink-line)] px-3">
            <Search className="h-4 w-4 shrink-0 text-[color:var(--ink-muted)]" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
              onKeyDown={onKeyDown}
              placeholder="Search by project name…"
              className="h-10 flex-1 bg-transparent text-[13px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-faint)]"
            />
          </div>
          <ul className="max-h-[220px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-[12px] text-[color:var(--ink-muted)]">
                {list.length === 0 ? "No projects yet — create one below." : `No match for "${query}".`}
              </li>
            ) : (
              filtered.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => choose(p)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                      i === activeIdx && "bg-black/[0.045]",
                    )}
                  >
                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[color:var(--ink-faint)]" />
                    <span className="flex-1 truncate text-[13px] text-[color:var(--ink)]">{p.name}</span>
                    {p.id === value && <Check className="h-4 w-4 shrink-0 text-[color:var(--accent)]" />}
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-[color:var(--ink-line)]">
            <button
              type="button"
              onClick={() => { setSheetOpen(true); setOpen(false); }}
              className="flex w-full items-center justify-center gap-1.5 px-3 py-2.5 text-[12px] font-medium text-[color:var(--ink-soft)] transition-colors hover:bg-black/[0.04]"
            >
              <Plus className="h-3.5 w-3.5" />
              Create new project
            </button>
          </div>
        </div>
      )}

      <ProjectFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
