import Link from "next/link";
import {
  ArrowUpRight,
  ChevronDown,
  Filter,
  MessageSquare,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Squircle,
  Star,
} from "lucide-react";
import { hero, nav } from "@/lib/v3/landing-copy";
import { BevelButton } from "./_primitives/BevelButton";
import { HalftoneFigure } from "./_primitives/HalftoneFigure";
import { PlusCorner } from "./_primitives/PlusCorner";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-[color:var(--paper)]">
      <Wallpaper />
      <TopNav />
      <div className="relative z-10 mx-auto max-w-[1240px] px-6 pt-16 pb-24 sm:pt-24 lg:px-12 lg:pt-32 lg:pb-32">
        <div className="mx-auto max-w-3xl text-center">
          <p
            className="quiet-caps v3-mount-fade"
            style={{ animationDelay: "120ms" }}
          >
            {hero.eyebrow}
          </p>
          <h1 className="font-display v3-headline mt-7 text-[44px] leading-[1.02] tracking-[-0.035em] sm:text-[60px] md:text-[72px] lg:text-[84px]">
            <span className="v3-line-mask">
              <span style={{ animationDelay: "60ms" }}>
                {hero.headline.lead}
              </span>
            </span>
            <span className="v3-line-mask">
              <span
                className="v3-italic text-[color:var(--ink-soft)]"
                style={{ animationDelay: "200ms" }}
              >
                {hero.headline.accent}
              </span>
            </span>
          </h1>
          <p
            className="v3-mount-fade mx-auto mt-8 max-w-xl text-[15px] leading-[1.65] text-[color:var(--ink-muted)] sm:text-[16px]"
            style={{ animationDelay: "560ms" }}
          >
            {hero.subhead}
          </p>
          <div
            className="v3-mount-rise mt-10 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "780ms" }}
          >
            <BevelButton href={hero.ctas.primary.href} size="lg" variant="filled">
              {hero.ctas.primary.label}
            </BevelButton>
            <BevelButton href={hero.ctas.secondary.href} size="lg" variant="outline">
              {hero.ctas.secondary.label}
            </BevelButton>
          </div>
        </div>

        <div
          className="v3-blueprint relative mx-auto mt-20 max-w-[1080px]"
          aria-hidden
        >
          <AppMockup />
          <ChatPanel />
        </div>
      </div>
    </section>
  );
}

function Wallpaper() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 select-none"
    >
      <div className="absolute left-0 top-[5%] hidden h-[78%] w-[34%] opacity-[0.92] sm:block">
        <HalftoneFigure
          variant="wallpaper-left"
          width={480}
          height={720}
          density={5}
          className="h-full w-full"
        />
      </div>
      <div className="absolute right-0 top-[5%] hidden h-[78%] w-[34%] opacity-[0.92] sm:block">
        <HalftoneFigure
          variant="wallpaper-right"
          width={480}
          height={720}
          density={5}
          className="h-full w-full"
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-[color:var(--paper)] via-[color:var(--paper)]/85 to-transparent" />
    </div>
  );
}

function TopNav() {
  return (
    <div className="relative z-20">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6 lg:h-20 lg:px-12">
        <Link
          href={"/v3" as never}
          className="group inline-flex items-center gap-2.5"
          aria-label="JobFlex home"
        >
          <span
            className="grid h-8 w-8 place-items-center bg-[color:var(--ink)] font-display text-[14px] font-semibold leading-none text-[color:var(--paper)]"
            style={{
              clipPath:
                "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))",
            }}
          >
            J
          </span>
          <span className="font-display text-[17px] font-medium tracking-[-0.02em] text-[color:var(--ink)]">
            JobFlex
          </span>
        </Link>

        <nav className="hidden items-center gap-0 md:flex">
          {nav.links.map((link, idx) => (
            <div key={link.label} className="flex items-center">
              {idx > 0 ? (
                <span
                  aria-hidden
                  className="mx-3 inline-block h-3 w-px bg-[color:var(--ink-line)]"
                />
              ) : null}
              <Link
                href={link.href as never}
                className="text-[12px] font-medium uppercase tracking-[0.12em] text-[color:var(--ink-muted)] transition-colors hover:text-[color:var(--ink)]"
              >
                {link.label === "How it works" ? (
                  <span className="inline-flex items-center gap-1">
                    {link.label}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </span>
                ) : (
                  link.label
                )}
              </Link>
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href={nav.signIn.href as never}
            className="hidden text-[12px] font-medium uppercase tracking-[0.12em] text-[color:var(--ink-soft)] transition-colors hover:text-[color:var(--ink)] sm:inline-flex"
          >
            {nav.signIn.label}
          </Link>
          <BevelButton href={nav.cta.href} size="md" variant="filled">
            {nav.cta.label}
          </BevelButton>
        </div>
      </div>
      <div className="mx-auto h-px max-w-[1280px] bg-[color:var(--ink-line)] opacity-60" />
    </div>
  );
}

function AppMockup() {
  const { mock } = hero;
  return (
    <div className="relative overflow-hidden rounded-[14px] border border-[color:var(--ink-line)] bg-white shadow-pop">
      <PlusCorner position="tl" tone="light" size={14} />
      <PlusCorner position="tr" tone="light" size={14} />

      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-[color:var(--ink-line)] bg-[color:var(--paper-deep)]/70 px-4 py-2.5">
        <span className="h-[10px] w-[10px] rounded-full bg-[#FF5F57]" />
        <span className="h-[10px] w-[10px] rounded-full bg-[#FEBC2E]" />
        <span className="h-[10px] w-[10px] rounded-full bg-[#28C840]" />
        <span className="flex-1 text-center font-display text-[11px] font-medium text-[color:var(--ink-muted)]">
          {mock.appName}
        </span>
        <span className="w-12" />
      </div>

      <div className="grid grid-cols-[200px_1fr]">
        {/* Sidebar */}
        <aside className="border-r border-[color:var(--ink-line)] bg-[color:var(--paper-deep)]/40 px-3 py-4">
          <div className="flex items-center justify-between rounded-[6px] px-2 py-1.5 hover:bg-white/60">
            <span className="inline-flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded-[4px] bg-[color:var(--ink)] text-[color:var(--paper)] text-[10px] font-semibold">
                A
              </span>
              <span className="text-[11px] font-medium text-[color:var(--ink-soft)]">
                {mock.workspaceLabel}
              </span>
            </span>
            <ChevronDown className="h-3 w-3 text-[color:var(--ink-faint)]" />
          </div>

          <div className="mt-3 flex items-center gap-1.5 rounded-[6px] bg-white px-2 py-1.5 border border-[color:var(--ink-line)]">
            <Search className="h-3 w-3 text-[color:var(--ink-faint)]" />
            <span className="text-[10px] text-[color:var(--ink-faint)]">
              Search
            </span>
            <span className="ml-auto rounded-[3px] border border-[color:var(--ink-line)] px-1 text-[9px] text-[color:var(--ink-faint)]">
              ⌘K
            </span>
          </div>

          <button
            type="button"
            className="mt-3 inline-flex w-full items-center gap-2 rounded-[6px] border border-[color:var(--ink-line)] px-2 py-1.5 text-[11px] font-medium text-[color:var(--ink-soft)]"
          >
            <MessageSquare className="h-3 w-3 text-[color:var(--ink-muted)]" />
            New chat
          </button>

          <div className="mt-5 px-1">
            <div className="quiet-caps mb-2 text-[9px] tracking-[0.16em]">
              Favorites
            </div>
            {mock.sidebarSections.map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-2 rounded-[5px] px-2 py-1 text-[11px] text-[color:var(--ink-soft)]"
              >
                <Star className="h-3 w-3 fill-current text-[color:var(--amber)]/80" />
                <span className="truncate">{s.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 px-1">
            <div className="quiet-caps mb-2 text-[9px] tracking-[0.16em]">
              Workspace
            </div>
            {mock.sidebarModules.map((m) => {
              const isActive = m === mock.activeModule;
              return (
                <div
                  key={m}
                  className={
                    "flex items-center gap-2 rounded-[5px] px-2 py-1 text-[11px] " +
                    (isActive
                      ? "bg-white text-[color:var(--ink)] shadow-hairline"
                      : "text-[color:var(--ink-muted)]")
                  }
                >
                  <Squircle
                    className={
                      "h-3 w-3 " +
                      (isActive
                        ? "text-[color:var(--accent)]"
                        : "text-[color:var(--ink-faint)]")
                    }
                  />
                  <span className="truncate">{m}</span>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Main table */}
        <main className="bg-white">
          <div className="flex items-center justify-between border-b border-[color:var(--ink-line)] px-4 py-2.5">
            <div className="inline-flex items-center gap-2 text-[12px] font-medium text-[color:var(--ink)]">
              <span className="inline-block h-3 w-3 rounded-[3px] border border-[color:var(--ink-line)]" />
              {mock.tableTitle}
              <span className="text-[color:var(--ink-faint)]">
                · {mock.tableCount}
              </span>
              <ChevronDown className="h-3 w-3 text-[color:var(--ink-faint)]" />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-[5px] px-2 py-1 text-[11px] text-[color:var(--ink-soft)] hover:bg-[color:var(--paper-deep)]/60"
              >
                <Filter className="h-3 w-3" />
                Filter
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-[5px] px-2 py-1 text-[11px] text-[color:var(--ink-soft)] hover:bg-[color:var(--paper-deep)]/60"
              >
                <SlidersHorizontal className="h-3 w-3" />
                Sort
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-[5px] border border-[color:var(--ink-line)] bg-[color:var(--ink)] px-2 py-1 text-[11px] text-[color:var(--paper)]"
              >
                <Plus className="h-3 w-3" />
                New
              </button>
            </div>
          </div>

          <div className="grid grid-cols-[20px_1.4fr_0.8fr_0.8fr_0.7fr_0.8fr_0.9fr] items-center gap-2 border-b border-[color:var(--ink-line)] bg-[color:var(--paper-deep)]/30 px-4 py-2 text-[10px] uppercase tracking-[0.08em] text-[color:var(--ink-muted)]">
            <span className="inline-block h-3 w-3 rounded-[3px] border border-[color:var(--ink-line)]" />
            {mock.columns.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>

          <ul className="divide-y divide-[color:var(--ink-line)]">
            {mock.rows.map((r, i) => (
              <li
                key={r.lead}
                className="grid grid-cols-[20px_1.4fr_0.8fr_0.8fr_0.7fr_0.8fr_0.9fr] items-center gap-2 px-4 py-2.5 text-[11px] text-[color:var(--ink-soft)]"
              >
                <span className="inline-block h-3 w-3 rounded-[3px] border border-[color:var(--ink-line)]" />
                <span className="inline-flex items-center gap-2 truncate">
                  <span
                    className="grid h-4 w-4 place-items-center rounded-[3px] text-[8px] font-medium text-white"
                    style={{
                      background:
                        i % 3 === 0
                          ? "var(--accent)"
                          : i % 3 === 1
                            ? "var(--emerald)"
                            : "var(--amber)",
                    }}
                  >
                    {r.lead.charAt(0)}
                  </span>
                  <span className="truncate">{r.lead}</span>
                </span>
                <span className="truncate text-[color:var(--ink-muted)]">
                  {r.trade}
                </span>
                <span className="truncate text-[color:var(--ink-muted)]">
                  {r.source}
                </span>
                <span className="truncate text-[color:var(--ink-muted)]">
                  {r.owner}
                </span>
                <span className="tabular truncate">{r.value}</span>
                <span className="truncate text-[10px]">
                  <span className="rounded-[3px] border border-[color:var(--ink-line)] bg-[color:var(--paper-deep)]/60 px-1.5 py-0.5 text-[color:var(--ink-soft)]">
                    {r.stage}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </main>
      </div>
    </div>
  );
}

function ChatPanel() {
  const { chat } = hero.mock;
  return (
    <div className="absolute -bottom-10 right-2 hidden w-[320px] overflow-hidden rounded-[10px] border border-[color:var(--ink-line)] bg-white shadow-pop md:right-[-30px] md:block lg:right-[-60px]">
      <div className="flex items-center gap-1 border-b border-[color:var(--ink-line)] bg-[color:var(--paper-deep)]/70 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-[#FF5F57]" />
        <span className="h-2 w-2 rounded-full bg-[#FEBC2E]" />
        <span className="h-2 w-2 rounded-full bg-[#28C840]" />
        <div className="ml-3 inline-flex rounded-[5px] border border-[color:var(--ink-line)] bg-white p-[2px] text-[10px]">
          <span className="rounded-[3px] px-2 py-0.5 text-[color:var(--ink-muted)]">
            Editor
          </span>
          <span className="inline-flex items-center gap-1 rounded-[3px] bg-[color:var(--paper-deep)] px-2 py-0.5 text-[color:var(--ink)] shadow-hairline">
            <Sparkles className="h-2.5 w-2.5 text-[color:var(--accent)]" />
            {chat.title}
          </span>
        </div>
      </div>
      <div className="px-4 py-4">
        <p className="text-[11.5px] leading-[1.55] text-[color:var(--ink-soft)]">
          {chat.promptHint}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2 text-[10px]">
          <div className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-[4px] border border-[color:var(--ink-line)] px-1.5 py-0.5 text-[color:var(--ink-muted)]">
              <ArrowUpRight className="h-2.5 w-2.5" />
              {chat.pillContext}
            </span>
            <span className="inline-flex items-center gap-1 rounded-[4px] border border-[color:var(--ink-line)] px-1.5 py-0.5 text-[color:var(--ink-muted)]">
              {chat.pillBranch}
            </span>
            <span className="inline-flex items-center gap-1 rounded-[4px] border border-[color:var(--ink-line)] px-1.5 py-0.5 text-[color:var(--ink-muted)]">
              {chat.pillRepo}
            </span>
          </div>
          <button
            type="button"
            className="grid h-6 w-6 place-items-center rounded-full bg-[color:var(--accent)] text-white"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
