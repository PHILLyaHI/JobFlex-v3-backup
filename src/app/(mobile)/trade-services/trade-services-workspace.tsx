"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Inbox, Megaphone, EyeOff, HandHeart, Radio, Sprout } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { TradeTabs } from "./trade-tabs";
import { TradeJobCard } from "./trade-job-card";
import { TradeJobDetail } from "./trade-job-detail";
import { OwnPostCard } from "./own-post-card";
import { PostJobSheet } from "./post-job-sheet";
import { TradeChatSheet } from "./trade-chat-sheet";
import {
  type TradeJob,
  type OwnPost,
  type ChatMessage,
  type TabKey,
  type ViewerStatus,
  type TradeInboxDTO,
  type TradeNetworkProfileDTO,
} from "./trade-data";
import {
  respondToTradeJob,
  restoreTradeJob,
  setTradeJobStatus,
  getTradeConversation,
  sendTradeMessage,
  setTradeNetworkOptIn,
} from "@/actions/tradeServices";
import { devSeedTradeNetwork } from "@/actions/tradeServicesDevSeed";

interface WorkspaceProps {
  initialInbox: TradeInboxDTO;
  initialMyPosts: OwnPost[];
  initialProfile: TradeNetworkProfileDTO;
  isDev: boolean;
}

const flattenInbox = (i: TradeInboxDTO): TradeJob[] => [
  ...i.newJobs,
  ...i.engaged,
  ...i.hidden,
];

export function TradeServicesWorkspace({
  initialInbox,
  initialMyPosts,
  initialProfile,
  isDev,
}: WorkspaceProps) {
  const router = useRouter();

  const [jobs, setJobs] = React.useState<TradeJob[]>(() => flattenInbox(initialInbox));
  const [ownPosts, setOwnPosts] = React.useState<OwnPost[]>(initialMyPosts);
  const [optIn, setOptIn] = React.useState(initialProfile.optIn);
  const [conversations, setConversations] = React.useState<Record<string, ChatMessage[]>>({});

  const [tab, setTab] = React.useState<TabKey>("new");
  const [detailJobId, setDetailJobId] = React.useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [postSheetOpen, setPostSheetOpen] = React.useState(false);
  const [chatJob, setChatJob] = React.useState<TradeJob | null>(null);
  const [chatOpen, setChatOpen] = React.useState(false);

  // Reconcile optimistic local state with authoritative server data when a refresh
  // delivers new props. All three props refresh together (one server render), so
  // tracking the inbox identity is enough. Done during render (not in an effect)
  // per React's "adjust state when a prop changes" guidance.
  const [syncedInbox, setSyncedInbox] = React.useState(initialInbox);
  if (syncedInbox !== initialInbox) {
    setSyncedInbox(initialInbox);
    setJobs(flattenInbox(initialInbox));
    setOwnPosts(initialMyPosts);
    setOptIn(initialProfile.optIn);
  }

  const newJobs = jobs.filter((j) => j.viewerStatus === "NEW");
  const tradeJobs = jobs.filter((j) => j.viewerStatus === "INTERESTED");
  const hiddenJobs = jobs.filter((j) => j.viewerStatus === "NOT_INTERESTED");

  const counts: Record<TabKey, number> = {
    new: newJobs.length,
    trades: tradeJobs.length,
    posts: ownPosts.length,
    hidden: hiddenJobs.length,
  };

  const detailJob = detailJobId
    ? jobs.find((j) => j.id === detailJobId) ?? null
    : null;
  const showFab = !(tab === "posts" && ownPosts.length === 0);

  // Run a mutation, surface errors, and always resync from the server.
  const run = (p: Promise<unknown>, errMsg: string) =>
    p
      .catch((e: unknown) => toast.error(errMsg, e instanceof Error ? e.message : undefined))
      .finally(() => router.refresh());

  const setStatus = (id: string, status: ViewerStatus, hiddenDaysAgo?: number) =>
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, viewerStatus: status, hiddenDaysAgo } : j)),
    );

  // ── Triage ────────────────────────────────────────────────────────────
  const handleInterested = (job: TradeJob) => {
    setStatus(job.id, "INTERESTED");
    toast.success("Marked interested", `Find ${job.postedByName.split(" ")[0]}'s job under My Trades.`);
    run(respondToTradeJob(job.id, "INTERESTED"), "Couldn't mark interested");
  };

  const handleNotInterested = (job: TradeJob) => {
    setStatus(job.id, "NOT_INTERESTED", 0);
    toast.info("Hidden", "Clears in 7 days, restore it any time from Hidden.");
    run(respondToTradeJob(job.id, "NOT_INTERESTED"), "Couldn't hide job");
  };

  const handleRestore = (job: TradeJob) => {
    setStatus(job.id, "NEW", undefined);
    toast.success("Back in New Jobs", job.title);
    run(restoreTradeJob(job.id), "Couldn't restore job");
  };

  // ── Chat ─────────────────────────────────────────────────────────────
  const handleChat = (job: TradeJob) => {
    setChatJob(job);
    setChatOpen(true);
    getTradeConversation(job.id)
      .then((msgs) => setConversations((prev) => ({ ...prev, [job.id]: msgs })))
      .catch(() => setConversations((prev) => ({ ...prev, [job.id]: prev[job.id] ?? [] })));
  };

  const handleSendChat = (jobId: string, body: string) => {
    setConversations((prev) => ({
      ...prev,
      [jobId]: [
        ...(prev[jobId] ?? []),
        { id: crypto.randomUUID(), body, mine: true, atLabel: "Just now" },
      ],
    }));
    sendTradeMessage(jobId, body).catch((e: unknown) =>
      toast.error("Couldn't send", e instanceof Error ? e.message : undefined),
    );
  };

  // ── Posting ──────────────────────────────────────────────────────────
  const handlePosted = () => {
    setTab("posts");
    router.refresh();
  };

  const handleMarkFilled = (post: OwnPost) => {
    setOwnPosts((prev) =>
      prev.map((p): OwnPost => (p.id === post.id ? { ...p, status: "FILLED" } : p)),
    );
    toast.success("Marked filled", post.title);
    run(setTradeJobStatus(post.id, "FILLED"), "Couldn't update post");
  };

  const handleCancelPost = (post: OwnPost) => {
    setOwnPosts((prev) =>
      prev.map((p): OwnPost => (p.id === post.id ? { ...p, status: "CANCELLED" } : p)),
    );
    toast.info("Post cancelled", "It's no longer broadcasting.");
    run(setTradeJobStatus(post.id, "CANCELLED"), "Couldn't update post");
  };

  // ── Network opt-in / dev seed ────────────────────────────────────────
  const handleOptIn = () => {
    setOptIn(true);
    toast.success("You're in the network", "We'll match jobs to your trades.");
    run(
      setTradeNetworkOptIn({ optIn: true, tradeTypes: [], specialties: [] }),
      "Couldn't join the network",
    );
  };

  const handleSeed = () => {
    toast.info("Loading demo data…");
    devSeedTradeNetwork()
      .then((r) => {
        toast.success("Demo data loaded", `${r.jobs} jobs`);
        router.refresh();
      })
      .catch((e: unknown) =>
        toast.error("Seed failed", e instanceof Error ? e.message : undefined),
      );
  };

  const openDetail = (job: TradeJob) => {
    setDetailJobId(job.id);
    setSheetOpen(true);
  };

  const cardHandlers = {
    onOpen: openDetail,
    onInterested: handleInterested,
    onNotInterested: handleNotInterested,
    onRestore: handleRestore,
    onChat: handleChat,
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[color:var(--paper)]">
      {/* ── Top chrome ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 pt-safe bg-[color-mix(in_srgb,var(--paper)_92%,transparent)] backdrop-blur-md">
        <header className="px-4 pt-3 pb-3">
          <div className="quiet-caps text-[color:var(--ink-faint)]">Messages</div>
          <h1 className="mt-1 font-display text-[26px] leading-none tracking-[-0.025em] text-[color:var(--ink)]">
            Trade &amp; Services
          </h1>
          <p className="mt-1.5 text-[13px] text-[color:var(--ink-muted)]">
            Hand off the jobs you can&apos;t take, and pick up the ones you can.
          </p>
        </header>
        <TradeTabs active={tab} counts={counts} onChange={setTab} />
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 px-4 pt-4 pb-[calc(7rem+var(--safe-bottom))]">
        {tab === "new" && (
          <TabPanel
            helper={
              optIn && newJobs.length > 0
                ? "Matched to your trades and skills. Keep the ones you want; pass on the rest."
                : undefined
            }
          >
            {!optIn ? (
              <EmptyState
                icon={<Radio className="h-5 w-5" />}
                title="Join the trade network"
                description="Opt in to receive jobs matched to your trades and skills from contractors near you. You control what you share, and you can leave any time."
                action={
                  <div className="flex flex-col items-center gap-2">
                    <Button
                      variant="primary"
                      icon={<Radio className="h-4 w-4" />}
                      className="h-11"
                      onClick={handleOptIn}
                    >
                      Join the network
                    </Button>
                    {isDev && (
                      <Button variant="ghost" className="h-10" onClick={handleSeed}>
                        <Sprout className="h-4 w-4" /> Load demo data
                      </Button>
                    )}
                  </div>
                }
              />
            ) : newJobs.length === 0 ? (
              <EmptyState
                icon={<Inbox className="h-5 w-5" />}
                title="You're all caught up"
                description="New jobs matched to your trades and skills will land here. We only send work that fits what you do."
                action={
                  isDev ? (
                    <Button variant="ghost" className="h-10" onClick={handleSeed}>
                      <Sprout className="h-4 w-4" /> Load demo data
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <CardStack jobs={newJobs} handlers={cardHandlers} />
            )}
          </TabPanel>
        )}

        {tab === "trades" && (
          <TabPanel
            helper={
              tradeJobs.length > 0
                ? "Jobs you're engaged on. Each opens a direct line to the poster."
                : undefined
            }
          >
            {tradeJobs.length === 0 ? (
              <EmptyState
                icon={<HandHeart className="h-5 w-5" />}
                title="No active trades yet"
                description="Tap Interested on a job and it moves here, with a private chat to work out timing, price and details."
              />
            ) : (
              <CardStack jobs={tradeJobs} handlers={cardHandlers} />
            )}
          </TabPanel>
        )}

        {tab === "posts" && (
          <TabPanel
            helper={
              ownPosts.length > 0
                ? "Jobs you've broadcast. Mark one filled or cancel it when you're sorted."
                : undefined
            }
          >
            {ownPosts.length === 0 ? (
              <EmptyState
                icon={<Megaphone className="h-5 w-5" />}
                title="Post a job to the network"
                description="Broadcast a job you can't take to matching contractors nearby, then track who's interested."
                action={
                  <Button
                    variant="primary"
                    icon={<Plus className="h-4 w-4" />}
                    className="h-11"
                    onClick={() => setPostSheetOpen(true)}
                  >
                    Post a job
                  </Button>
                }
              />
            ) : (
              <div className="space-y-3">
                {ownPosts.map((post) => (
                  <OwnPostCard
                    key={post.id}
                    post={post}
                    onMarkFilled={handleMarkFilled}
                    onCancel={handleCancelPost}
                  />
                ))}
              </div>
            )}
          </TabPanel>
        )}

        {tab === "hidden" && (
          <TabPanel
            helper={
              hiddenJobs.length > 0
                ? "Passed jobs rest here for 7 days, then clear automatically."
                : undefined
            }
          >
            {hiddenJobs.length === 0 ? (
              <EmptyState
                icon={<EyeOff className="h-5 w-5" />}
                title="Nothing hidden"
                description="Jobs you pass on wait here for 7 days in case you change your mind, then clear on their own."
              />
            ) : (
              <CardStack jobs={hiddenJobs} handlers={cardHandlers} />
            )}
          </TabPanel>
        )}
      </main>

      {/* ── Context FAB ─────────────────────────────────────────────────── */}
      {showFab && (
        <button
          type="button"
          onClick={() => setPostSheetOpen(true)}
          aria-label="Post a job"
          className={cn(
            "fixed right-4 z-30 inline-flex h-14 items-center gap-2 rounded-full pl-4 pr-5",
            "bg-[color:var(--ink)] text-[14px] font-medium text-[color:var(--paper)]",
            "shadow-[0_8px_24px_-6px_rgba(20,24,31,0.45)] transition-transform active:translate-y-[1px] focus-ring",
          )}
          style={{ bottom: "calc(1.25rem + var(--safe-bottom))" }}
        >
          <Plus className="h-5 w-5" />
          Post a job
        </button>
      )}

      {/* ── Sheets ──────────────────────────────────────────────────────── */}
      <TradeJobDetail
        job={detailJob}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onInterested={handleInterested}
        onNotInterested={handleNotInterested}
        onRestore={handleRestore}
        onChat={handleChat}
      />
      <PostJobSheet
        open={postSheetOpen}
        onClose={() => setPostSheetOpen(false)}
        onPosted={handlePosted}
      />
      <TradeChatSheet
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        job={chatJob}
        messages={chatJob ? conversations[chatJob.id] ?? [] : []}
        // `undefined` = this job's history has never come back from the server.
        // An empty array is a real answer ("no messages yet"); the two must not
        // collapse, or an existing thread claims to be empty while it loads.
        loading={chatJob ? conversations[chatJob.id] === undefined : false}
        onSend={handleSendChat}
      />
    </div>
  );
}

function TabPanel({
  helper,
  children,
}: {
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {helper && (
        <p className="mb-3 text-[12px] leading-relaxed text-[color:var(--ink-muted)]">
          {helper}
        </p>
      )}
      {children}
    </div>
  );
}

function CardStack({
  jobs,
  handlers,
}: {
  jobs: TradeJob[];
  handlers: {
    onOpen: (j: TradeJob) => void;
    onInterested: (j: TradeJob) => void;
    onNotInterested: (j: TradeJob) => void;
    onRestore: (j: TradeJob) => void;
    onChat: (j: TradeJob) => void;
  };
}) {
  return (
    <div className="space-y-3">
      {jobs.map((job) => (
        <TradeJobCard key={job.id} job={job} {...handlers} />
      ))}
    </div>
  );
}
