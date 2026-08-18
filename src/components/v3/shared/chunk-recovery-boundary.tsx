"use client";

// CHUNK RECOVERY BOUNDARY — the safety net under every `dynamic(…, { ssr: false })`
// handheld surface.
//
// ── THE FAILURE THIS EXISTS FOR ────────────────────────────────────────────
// A phone loads /dashboard from build A. Build B deploys. The visitor taps a
// nav item; the shell reaches for the handheld chunk for the new route and asks
// for a filename that only build A ever emitted. The CDN answers 404, the lazy
// import rejects, and React unwinds mid-commit — which the production build
// reports as "Application error: a client-side exception has occurred" with a
// minified #310 (hook count changed between renders), because the tree that was
// about to mount never arrived. The 404 is the cause; the hook error is the
// symptom, and it is the one the user sees.
//
// `deploymentId` in next.config.ts is the real fix and handles the common case.
// This boundary is the belt to that pair of braces: it also covers a chunk lost
// to a flaky network, an aggressive proxy, or a CDN edge that has not caught up.
//
// ── WHY IT RELOADS INSTEAD OF RETRYING ─────────────────────────────────────
// Re-importing gets the same dead URL — the filename is baked into the running
// bundle. Only a full document load picks up the new build's manifest, so a
// reload is the only retry that can succeed.
//
// ── WHY IT CANNOT LOOP ─────────────────────────────────────────────────────
// A build that is genuinely broken fails again the instant it comes back, and a
// boundary that reloads on every failure would pin the tab in a refresh loop
// with no way out. So the reload is stamped into sessionStorage. A second
// failure inside RECOVERY_WINDOW_MS means the reload did not help — that is a
// broken build, not skew, and the visitor gets a readable panel with a manual
// button instead of another spin. An older stamp is treated as a fresh event:
// the page ran fine for a while, so this is the NEXT deploy, not the same one
// failing twice.

import React from "react";

/** One key for the whole app. The condition being tracked is "this tab already
 *  spent a reload trying to escape a dead chunk", which is a property of the
 *  document, not of any one surface. sessionStorage, not localStorage, so a new
 *  tab always gets its one free recovery. */
const RELOAD_STAMP_KEY = "jf.chunk-recovery.reloaded-at";

/** How long after a recovery reload a second failure still counts as the SAME
 *  failure. A dead chunk rejects within a second or two of the surface
 *  mounting, so anything inside this window is the reload not having worked. */
const RECOVERY_WINDOW_MS = 15_000;

/** The shapes a lost chunk arrives in, and there is no single one — the message
 *  is bundler- and browser-specific, so the list is the contract:
 *
 *    Turbopack   "Failed to load chunk /_next/static/chunks/… from module …"
 *    webpack     "Loading chunk 4821 failed" / "Loading CSS chunk … failed",
 *                usually on an error named ChunkLoadError
 *    Chrome ESM  "Failed to fetch dynamically imported module: …"
 *    Firefox ESM "error loading dynamically imported module"
 *    Safari ESM  "Importing a module script failed"
 *
 *  Turbopack's wording is the one that matters most here: it is Next 16's
 *  default bundler, so it is what production actually throws — and it shares no
 *  words in that order with webpack's, which is why matching only the familiar
 *  webpack string would have quietly caught nothing.
 *
 *  Everything outside the list — a real bug inside the handheld tree — must NOT
 *  trigger a reload, or a deterministic crash becomes a refresh loop that hides
 *  its own stack trace. */
const CHUNK_ERROR_MESSAGE =
  /Failed to load chunk|Loading (?:CSS )?chunk [^\s]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError/i;

function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const name = (error as { name?: unknown }).name;
  if (name === "ChunkLoadError") return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && CHUNK_ERROR_MESSAGE.test(message);
}

/** True when this tab has not yet spent its recovery reload on this failure.
 *  Writes the stamp as a side effect, because the caller is about to reload and
 *  will not get another turn. A tab with sessionStorage denied (Safari private
 *  mode, a locked-down webview) reports "already used" and goes straight to the
 *  panel — the fallback is a worse experience than a reload, but an unbounded
 *  reload loop is a far worse one. */
function claimRecoveryReload(): boolean {
  try {
    const stamp = Number(window.sessionStorage.getItem(RELOAD_STAMP_KEY));
    if (stamp && Date.now() - stamp < RECOVERY_WINDOW_MS) return false;
    window.sessionStorage.setItem(RELOAD_STAMP_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

type Props = {
  children: React.ReactNode;
  /** Change this to clear a fallback that is already on screen — the shell
   *  passes the pathname, so a client-side navigation away from a surface whose
   *  chunk is missing lands on a live page rather than a stuck panel. */
  resetKey?: string;
};

type State = {
  error: unknown;
  /** Set by componentDidCatch, one commit after the error. Until then the
   *  boundary does not yet know whether it is reloading or giving up, so it
   *  holds on paper — see the render comment. */
  verdict?: "reloading" | "give-up";
  lastResetKey?: string;
};

export class ChunkRecoveryBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error, verdict: undefined };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (state.lastResetKey === props.resetKey) return null;
    return { error: null, verdict: undefined, lastResetKey: props.resetKey };
  }

  componentDidCatch(error: unknown) {
    // A real bug inside the handheld tree is not this boundary's business; it
    // is rethrown from render() so it reaches the app's own error UI with its
    // stack intact. Nothing to decide here in that case.
    if (!isChunkLoadError(error)) return;
    if (claimRecoveryReload()) {
      this.setState({ verdict: "reloading" });
      window.location.reload();
    } else {
      this.setState({ verdict: "give-up" });
    }
  }

  render() {
    const { error, verdict } = this.state;
    if (!error) return this.props.children;

    // Rethrowing during RENDER — not from componentDidCatch — is what lets a
    // non-chunk error keep travelling up to the nearest ancestor boundary. An
    // error thrown from a lifecycle after commit is treated as uncaught.
    if (!isChunkLoadError(error)) throw error;

    // `verdict === undefined` is the single commit between the render-phase
    // catch and componentDidCatch. Hold on paper rather than flashing the
    // panel at someone who is about to be reloaded out of it anyway.
    if (verdict !== "give-up") return <PaperHold />;
    return <StaleBuildPanel />;
  }
}

// ── THE PANEL ──────────────────────────────────────────────────────────────
// Inline styles, and every token carries a literal fallback. This is the one
// component in the app that must assume the stylesheet it wants may be the very
// thing that failed to arrive — reading --paper is right when globals.css made
// it, and #f2f0eb keeps the panel legible when nothing did. Fixed and
// full-bleed for the same reason MobileHold is: it stands in for a handheld
// tree that would have been `position: fixed; inset: 0`, so anything less
// leaves the desktop shell showing through underneath it.

const panel: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 30,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 20,
  padding: 32,
  background: "var(--paper, #f2f0eb)",
  color: "var(--ink, #0a0a0a)",
  fontFamily: "var(--font-sans, 'Inter', system-ui, sans-serif)",
  textAlign: "center",
};

const kicker: React.CSSProperties = {
  fontFamily: "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--accent, #1854a0)",
};

const heading: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  textTransform: "uppercase",
  lineHeight: 1.1,
};

const body: React.CSSProperties = {
  margin: 0,
  maxWidth: "34ch",
  fontSize: 14,
  lineHeight: 1.5,
  color: "var(--ink-muted, #555555)",
};

const button: React.CSSProperties = {
  minHeight: 44,
  padding: "0 24px",
  border: "2px solid var(--ink, #0a0a0a)",
  borderRadius: "var(--r-sm, 2px)",
  background: "var(--paper, #f2f0eb)",
  color: "var(--ink, #0a0a0a)",
  boxShadow: "var(--shadow-sm, 3px 3px 0 rgba(10, 10, 10, 0.06))",
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  cursor: "pointer",
};

// A 2px ink rule under the kicker — the drawing-sheet divider that tells the
// visitor this is still JobFlex and not the browser's own error page.
const rule: React.CSSProperties = {
  width: 48,
  height: 2,
  background: "var(--ink, #0a0a0a)",
};

/** Character-identical to the MobileHold each switch declares for its `loading`
 *  state, so the one commit between "the chunk died" and "the tab reloads"
 *  looks like the load simply continuing. */
const PaperHold = () => (
  <div style={{ position: "fixed", inset: 0, zIndex: 30, background: "var(--paper, #f2f0eb)" }} />
);

function StaleBuildPanel() {
  return (
    <div style={panel} role="alert">
      <span style={kicker}>Build updated</span>
      <span style={rule} />
      <h2 style={heading}>This page needs a refresh</h2>
      <p style={body}>
        A newer version of JobFlex went live while this page was open. Reloading picks it up.
      </p>
      <button type="button" style={button} onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}
