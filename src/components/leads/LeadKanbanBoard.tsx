"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GripVertical, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { toast } from "@/components/ui/Toast";
import { relative } from "@/lib/format";
import { updateLeadStatus } from "@/actions/leads";

export interface KanbanLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  projectType: string | null;
  description: string | null;
  status: string;
  aiCategory: string | null;
  aiConfidence: number | null;
  createdAt: Date;
  assignee: string | null;
}

const COLUMNS = [
  { key: "NEW", label: "New" },
  { key: "ROUTED", label: "Routed" },
  { key: "CLAIMED", label: "Claimed" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "QUOTED", label: "Quoted" },
  { key: "WON", label: "Won" },
  { key: "LOST", label: "Lost" },
] as const;

type Status = (typeof COLUMNS)[number]["key"];

const COLUMN_TONE: Record<Status, string> = {
  NEW: "rgba(31,122,82,0.18)",
  ROUTED: "rgba(31,122,82,0.12)",
  CLAIMED: "rgba(200,148,80,0.16)",
  CONTACTED: "rgba(200,148,80,0.12)",
  QUOTED: "rgba(14,165,233,0.14)",
  WON: "rgba(5,150,105,0.16)",
  LOST: "rgba(225,29,72,0.10)",
};

export function LeadKanbanBoard({
  leads,
  heightClass = "h-[calc(100vh-260px)]",
}: {
  leads: KanbanLead[];
  /** Tailwind height class for the board's scroll viewport. Override on embeds
   *  (e.g. the dashboard) so a busy pipeline can't stretch the page; columns
   *  scroll internally instead. */
  heightClass?: string;
}) {
  const router = useRouter();
  const [items, setItems] = React.useState(leads);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [hoverCol, setHoverCol] = React.useState<Status | null>(null);

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const viewportId = React.useId();

  // Re-sync when the server supplies fresh leads (adjust-state-during-render,
  // the React-recommended alternative to a syncing effect).
  const [prevLeads, setPrevLeads] = React.useState(leads);
  if (leads !== prevLeads) {
    setPrevLeads(leads);
    setItems(leads);
  }

  const grouped = React.useMemo(() => {
    const map: Record<Status, KanbanLead[]> = {
      NEW: [],
      ROUTED: [],
      CLAIMED: [],
      CONTACTED: [],
      QUOTED: [],
      WON: [],
      LOST: [],
    };
    for (const l of items) {
      const k = (l.status as Status) ?? "NEW";
      if (map[k]) map[k].push(l);
    }
    return map;
  }, [items]);

  async function moveCard(id: string, toStatus: Status) {
    const before = items;
    setItems((prev) => prev.map((l) => (l.id === id ? { ...l, status: toStatus } : l)));
    try {
      await updateLeadStatus(id, toStatus);
      router.refresh();
    } catch (err: unknown) {
      setItems(before);
      toast.error("Couldn't move", err instanceof Error ? err.message : "Please try again.");
    }
  }

  return (
    <div className="flex min-h-0 flex-col">
      {/* Styled horizontal scrollbar — lifted to the top of the board so you can
          sweep across all seven stages without reaching for the bottom edge. It
          mirrors and drives the columns viewport below. */}
      <BoardScrollbar targetRef={scrollRef} itemCount={items.length} controlsId={viewportId} />

      <div
        ref={scrollRef}
        id={viewportId}
        className={cn(
          "kanban-x grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-4 overflow-x-auto -mx-4 px-4 min-h-0",
          heightClass,
        )}
      >
        {COLUMNS.map((col) => {
          const list = grouped[col.key];
          const isHover = hoverCol === col.key;
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setHoverCol(col.key);
              }}
              onDragLeave={() => setHoverCol((c) => (c === col.key ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                setHoverCol(null);
                setDraggingId(null);
                if (id) moveCard(id, col.key);
              }}
              className={cn(
                "rounded-[var(--r-md)] hairline transition-colors h-full min-h-0 flex flex-col scroll-ml-4",
                isHover
                  ? "bg-[color:var(--accent-soft)]/40 border-[color:var(--accent)]/30"
                  : "bg-white/40 dark:bg-white/[0.02]",
              )}
            >
              <div className="flex items-center justify-between px-3.5 py-3 border-b border-[color:var(--ink-line)]">
                <div className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: COLUMN_TONE[col.key] }}
                  />
                  <span className="quiet-caps !mb-0">{col.label}</span>
                </div>
                <span className="text-[11px] tabular text-[color:var(--ink-muted)]">
                  {list.length}
                </span>
              </div>
              <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                <AnimatePresence>
                  {list.map((l) => (
                    <KanbanCard
                      key={l.id}
                      lead={l}
                      dragging={draggingId === l.id}
                      onDragStart={() => setDraggingId(l.id)}
                      onDragEnd={() => setDraggingId(null)}
                    />
                  ))}
                </AnimatePresence>
                {list.length === 0 && (
                  <div className="text-[11px] text-[color:var(--ink-faint)] text-center py-8">
                    Drop here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hide the native bottom scrollbar — the styled rail above stands in for it. */}
      <style jsx>{`
        .kanban-x {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .kanban-x::-webkit-scrollbar {
          height: 0;
          width: 0;
          display: none;
        }
      `}</style>
    </div>
  );
}

/**
 * Custom horizontal scrollbar that sits above the kanban viewport. A hairline
 * track with a Pressed-Sage thumb that grows on hover and presses on drag —
 * draggable, click-to-jump, and kept in sync with wheel / trackpad scrolling.
 */
function BoardScrollbar({
  targetRef,
  itemCount,
  controlsId,
}: {
  targetRef: React.RefObject<HTMLDivElement | null>;
  itemCount: number;
  controlsId: string;
}) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{ startX: number; startScroll: number } | null>(null);
  const [thumb, setThumb] = React.useState({ width: 0, left: 0, scrollable: false, pct: 0 });
  const [dragging, setDragging] = React.useState(false);
  const [hovering, setHovering] = React.useState(false);

  const recompute = React.useCallback(() => {
    const el = targetRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const trackW = track.clientWidth;
    const { clientWidth, scrollWidth, scrollLeft } = el;
    const scrollable = scrollWidth - clientWidth > 1;
    if (!scrollable) {
      setThumb({ width: trackW, left: 0, scrollable: false, pct: 0 });
      return;
    }
    const width = Math.max(48, (clientWidth / scrollWidth) * trackW);
    const maxScroll = scrollWidth - clientWidth;
    const maxLeft = trackW - width;
    const left = maxScroll > 0 ? (scrollLeft / maxScroll) * maxLeft : 0;
    const pct = maxScroll > 0 ? Math.round((scrollLeft / maxScroll) * 100) : 0;
    setThumb({ width, left, scrollable: true, pct });
  }, [targetRef]);

  // Keep the thumb in lockstep with the viewport: native scroll, element
  // resize, and window resize all recompute geometry.
  React.useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    const onScroll = () => recompute();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    if (trackRef.current) ro.observe(trackRef.current);
    window.addEventListener("resize", recompute);
    recompute();
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [recompute, targetRef]);

  // Recompute when the card population changes (columns can widen/shrink).
  React.useEffect(() => {
    recompute();
  }, [recompute, itemCount]);

  // Pointer drag — translate thumb travel into viewport scrollLeft.
  React.useEffect(() => {
    if (!dragging) return;
    function onMove(e: PointerEvent) {
      const el = targetRef.current;
      const track = trackRef.current;
      const d = dragRef.current;
      if (!el || !track || !d) return;
      const trackW = track.clientWidth;
      const { clientWidth, scrollWidth } = el;
      const width = Math.max(48, (clientWidth / scrollWidth) * trackW);
      const maxLeft = trackW - width;
      const maxScroll = scrollWidth - clientWidth;
      const dx = e.clientX - d.startX;
      el.scrollLeft = d.startScroll + (maxLeft > 0 ? (dx / maxLeft) * maxScroll : 0);
    }
    function onUp() {
      setDragging(false);
      dragRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, targetRef]);

  function startDrag(e: React.PointerEvent) {
    const el = targetRef.current;
    if (!el) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startScroll: el.scrollLeft };
    setDragging(true);
  }

  // Click anywhere on the track to jump the viewport to that position.
  function jumpTo(e: React.PointerEvent) {
    if (e.target !== trackRef.current) return;
    const el = targetRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.scrollLeft = ratio * (el.scrollWidth - el.clientWidth);
  }

  return (
    <div
      ref={trackRef}
      onPointerDown={jumpTo}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={cn(
        "relative mb-3 h-2.5 w-full rounded-full bg-black/[0.04] transition-opacity",
        thumb.scrollable ? "cursor-pointer opacity-100" : "pointer-events-none opacity-0",
      )}
      role="scrollbar"
      aria-orientation="horizontal"
      aria-label="Scroll pipeline stages"
      aria-controls={controlsId}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={thumb.pct}
    >
      <div
        onPointerDown={startDrag}
        style={{ width: thumb.width, transform: `translateX(${thumb.left}px)` }}
        className={cn(
          "absolute inset-y-0 left-0 rounded-full transition-[background-color,box-shadow] duration-150",
          dragging
            ? "bg-[color:var(--accent)] shadow-[0_1px_3px_rgba(31,122,82,0.4)]"
            : hovering
              ? "bg-[color:var(--ink-muted)]"
              : "bg-[color:var(--ink-faint)]",
        )}
      />
    </div>
  );
}

function KanbanCard({
  lead,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  lead: KanbanLead;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: dragging ? 0.45 : 1, y: 0, scale: dragging ? 0.97 : 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      draggable
      onDragStart={(e) => {
        const ev = e as unknown as React.DragEvent<HTMLDivElement>;
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", lead.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "paper-card !shadow-none p-3 cursor-grab active:cursor-grabbing transition-shadow",
        "hover:shadow-[0_4px_12px_-6px_rgba(17,17,19,0.16)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[13px] text-[color:var(--ink)] truncate">
            {lead.name}
          </div>
          {lead.projectType && (
            <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5 truncate">
              {lead.projectType}
            </div>
          )}
        </div>
        <GripVertical className="h-3.5 w-3.5 text-[color:var(--ink-faint)] shrink-0 mt-0.5" />
      </div>

      <div className="mt-3 pt-2.5 border-t border-[color:var(--ink-line)] flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10.5px] text-[color:var(--ink-muted)]">
          {lead.email && <Mail className="h-3 w-3" />}
          {lead.phone && <Phone className="h-3 w-3" />}
          <span className="tabular">{relative(lead.createdAt)}</span>
        </div>
        {lead.assignee && (
          <div className="flex items-center gap-1.5">
            <Avatar name={lead.assignee} size={18} />
          </div>
        )}
      </div>
    </motion.div>
  );
}
