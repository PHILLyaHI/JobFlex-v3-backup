"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  MoreHorizontal,
  Pencil,
  Eye,
  Copy as CopyIcon,
  Send,
  Package,
  Home,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { toast } from "@/components/ui/Toast";
import { duplicateProposal } from "@/actions/proposals";
import { zillowSearchUrl } from "@/lib/zillow";
import { MaterialsSheet, type MaterialLine } from "./MaterialsSheet";
import { SendProposalDialog } from "./SendProposalDialog";
import { DeleteProposalDialog } from "./DeleteProposalDialog";

interface RowActionsProps {
  proposalId: string;
  publicId: string;
  title: string;
  clientName: string;
  clientEmail?: string | null;
  clientAddress?: { address?: string | null; city?: string | null; state?: string | null; zip?: string | null };
  materials: MaterialLine[];
}

interface MenuItem {
  key: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  iconBg: string;
  iconFg: string;
  onClick: () => void;
  disabled?: boolean;
  disabledHint?: string;
  danger?: boolean;
  external?: boolean;
}

export function RowActions({
  proposalId,
  publicId,
  title,
  clientName,
  clientEmail,
  clientAddress,
  materials,
}: RowActionsProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState<{ top: number; right: number } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  // Sub-modals
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [sendOpen, setSendOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  // Position menu via measured trigger so the popover floats clean of the
  // table's overflow-x-auto wrapper.
  const place = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({ top: r.bottom + 6, right: window.innerWidth - r.right });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    place();
    const onScroll = () => setOpen(false);
    const onResize = () => place();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-row-actions-menu]")) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open, place]);

  const zillow = zillowSearchUrl(clientAddress ?? {});

  async function onDuplicate() {
    setOpen(false);
    try {
      const res = await duplicateProposal(proposalId);
      toast.success("Duplicated", "Find the copy at the top of the list.");
      router.refresh();
      // Optimistic: navigate into the new copy so the user can edit immediately.
      router.push(`/dashboard/proposals/${res.id}` as any);
    } catch (err: any) {
      toast.error("Couldn't duplicate", err?.message);
    }
  }

  const groups: MenuItem[][] = [
    [
      {
        key: "edit",
        label: "Edit proposal",
        hint: "Open editor",
        icon: <Pencil className="h-3.5 w-3.5" />,
        iconBg: "rgba(31,122,82,0.12)",
        iconFg: "#1F7A52",
        onClick: () => {
          setOpen(false);
          router.push(`/dashboard/proposals/${proposalId}` as any);
        },
      },
      {
        key: "view",
        label: "View public page",
        hint: "New tab",
        icon: <Eye className="h-3.5 w-3.5" />,
        iconBg: "rgba(100,116,139,0.14)",
        iconFg: "#475569",
        external: true,
        onClick: () => {
          setOpen(false);
          window.open(`/portal/q/${publicId}`, "_blank", "noopener,noreferrer");
        },
      },
      {
        key: "duplicate",
        label: "Duplicate",
        hint: "Clone & edit",
        icon: <CopyIcon className="h-3.5 w-3.5" />,
        iconBg: "rgba(139,92,246,0.14)",
        iconFg: "#7C3AED",
        onClick: onDuplicate,
      },
    ],
    [
      {
        key: "send",
        label: "Send to client",
        hint: clientEmail ? clientEmail : "Add an email",
        icon: <Send className="h-3.5 w-3.5" />,
        iconBg: "rgba(5,150,105,0.14)",
        iconFg: "#047857",
        onClick: () => {
          setOpen(false);
          setSendOpen(true);
        },
      },
      {
        key: "materials",
        label: "Order materials",
        hint: `${materials.filter((m) => (m.materialCost ?? 0) > 0).length} items`,
        icon: <Package className="h-3.5 w-3.5" />,
        iconBg: "rgba(200,148,80,0.18)",
        iconFg: "#92651F",
        onClick: () => {
          setOpen(false);
          setSheetOpen(true);
        },
      },
      {
        key: "zillow",
        label: "View on Zillow",
        hint: zillow ? "External" : "No address on client",
        icon: <Home className="h-3.5 w-3.5" />,
        iconBg: "rgba(14,165,233,0.14)",
        iconFg: "#0369A1",
        disabled: !zillow,
        external: true,
        onClick: () => {
          setOpen(false);
          if (zillow) window.open(zillow, "_blank", "noopener,noreferrer");
        },
      },
    ],
    [
      {
        key: "delete",
        label: "Delete proposal",
        hint: "Permanent",
        icon: <Trash2 className="h-3.5 w-3.5" />,
        iconBg: "rgba(225,29,72,0.12)",
        iconFg: "#BE123C",
        danger: true,
        onClick: () => {
          setOpen(false);
          setDeleteOpen(true);
        },
      },
    ],
  ];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "h-8 w-8 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)]",
          "hover:bg-black/[0.05] hover:text-[color:var(--ink)] transition-colors",
          open && "bg-black/[0.05] text-[color:var(--ink)]",
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      <AnimatePresence>
        {open && coords && (
          <motion.div
            data-row-actions-menu
            role="menu"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            style={{ top: coords.top, right: coords.right }}
            className={cn(
              "fixed z-50 w-[260px] rounded-[var(--r-md)] overflow-hidden",
              "bg-white/85 dark:bg-[#1a1a1d]/85 backdrop-blur-xl",
              "border border-[color:var(--ink-line)]",
              "shadow-[0_24px_48px_-20px_rgba(17,17,19,0.30),0_2px_8px_-2px_rgba(17,17,19,0.10)]",
            )}
          >
            <div className="px-3 py-2 border-b border-[color:var(--ink-line)]">
              <div className="quiet-caps !mb-0">{title}</div>
              <div className="text-[11px] text-[color:var(--ink-muted)] truncate mt-0.5">
                {clientName}
              </div>
            </div>

            <div className="py-1">
              {groups.map((group, gi) => (
                <React.Fragment key={gi}>
                  {gi > 0 && <div className="my-1 mx-2 h-px bg-[color:var(--ink-line)]" />}
                  {group.map((item) => (
                    <MenuRow key={item.key} item={item} />
                  ))}
                </React.Fragment>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MaterialsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        proposalTitle={title}
        clientName={clientName}
        items={materials}
      />
      <SendProposalDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        proposalId={proposalId}
        proposalTitle={title}
        clientName={clientName}
        clientEmail={clientEmail}
      />
      <DeleteProposalDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        proposalId={proposalId}
        proposalTitle={title}
      />
    </>
  );
}

function MenuRow({ item }: { item: MenuItem }) {
  return (
    <button
      role="menuitem"
      type="button"
      disabled={item.disabled}
      onClick={item.onClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors",
        item.disabled
          ? "opacity-50 cursor-not-allowed"
          : item.danger
            ? "hover:bg-rose-50 dark:hover:bg-rose-500/10"
            : "hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
      )}
    >
      <span
        className="h-6 w-6 grid place-items-center rounded-[var(--r-sm)] shrink-0"
        style={{ background: item.iconBg, color: item.iconFg }}
      >
        {item.icon}
      </span>
      <span className="flex-1 min-w-0">
        <span
          className={cn(
            "block text-[12.5px] font-medium truncate",
            item.danger ? "text-rose-700 dark:text-rose-300" : "text-[color:var(--ink)]",
          )}
        >
          {item.label}
        </span>
        {item.hint && (
          <span className="block text-[10.5px] text-[color:var(--ink-muted)] truncate">
            {item.hint}
          </span>
        )}
      </span>
      {item.external && !item.disabled && (
        <ExternalLink className="h-3 w-3 text-[color:var(--ink-faint)] shrink-0" />
      )}
    </button>
  );
}
