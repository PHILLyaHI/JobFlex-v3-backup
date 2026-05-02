"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { TradePostCard } from "@/components/trade/TradePostCard";
import { createTradePost } from "@/actions/tradePosts";
import { cn } from "@/lib/cn";

interface PostItem {
  id: string;
  title: string;
  body: string;
  category: string | null;
  status: string;
  authorName: string | null;
  authorEmail: string;
  replyCount: number;
  createdAt: Date;
}

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "equipment", label: "Equipment" },
  { key: "subcontractor", label: "Subcontractor" },
  { key: "job-share", label: "Job share" },
  { key: "question", label: "Question" },
];

export function TradeBoardClient({
  posts,
  activeCategory,
}: {
  posts: PostItem[];
  activeCategory: string;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = React.useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => {
            const active = activeCategory === c.key;
            return (
              <button
                key={c.key}
                onClick={() =>
                  router.push(
                    (c.key === "all"
                      ? "/dashboard/trade"
                      : `/dashboard/trade?cat=${c.key}`) as any,
                  )
                }
                className={cn(
                  "rounded-full px-3 py-1.5 text-[11px] font-medium hairline transition-colors",
                  active
                    ? "bg-[color:var(--ink)] text-[color:var(--paper)] border-transparent"
                    : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto">
          <Button
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setSheetOpen(true)}
          >
            New post
          </Button>
        </div>
      </div>

      {posts.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-5 w-5" />}
          title="No posts here"
          description="Be the first to drop something useful. Other contractors in your workspace will see it."
          action={
            <Button icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setSheetOpen(true)}>
              New post
            </Button>
          }
        />
      ) : (
        <div className="columns-1 md:columns-2 xl:columns-3 gap-5">
          {posts.map((p) => (
            <TradePostCard
              key={p.id}
              id={p.id}
              title={p.title}
              body={p.body}
              category={p.category}
              status={p.status}
              authorName={p.authorName}
              authorEmail={p.authorEmail}
              replyCount={p.replyCount}
              createdAt={p.createdAt}
            />
          ))}
        </div>
      )}

      <NewTradePostSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSubmit={async (v) => {
          try {
            const res = await createTradePost(v);
            toast.success("Posted");
            router.push(`/dashboard/trade/${res.id}` as any);
          } catch (err: any) {
            toast.error("Couldn't post", err?.message);
          }
        }}
      />
    </>
  );
}

function NewTradePostSheet({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (v: { title: string; body: string; category: string | null }) => Promise<void>;
}) {
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [category, setCategory] = React.useState("question");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    try {
      await onSubmit({
        title: title.trim(),
        body: body.trim(),
        category: category || null,
      });
      setTitle("");
      setBody("");
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New trade post"
      description="Be specific — title in one line, details in the body."
      width="min(520px, 100vw)"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Post
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Select
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="equipment">Equipment</option>
          <option value="subcontractor">Subcontractor</option>
          <option value="job-share">Job share</option>
          <option value="question">Question</option>
        </Select>
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Looking for a drywall sub next week in Philadelphia"
        />
        <Textarea
          label="Details"
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Dates, specs, constraints, contact preferences."
        />
      </div>
    </Sheet>
  );
}
