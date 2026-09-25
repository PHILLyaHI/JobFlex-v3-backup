// "LISTEN" ON THE PROPOSAL LINE — the contractor's panel (2026-09-23).
//
// The row menu's "Listen to the proposal" and the accepted card's Listen
// button open one small fixed panel at the bottom right and play what the
// client hears: the same file, the same engine as the portal's card
// (components/portal/listen-engine), so what the office checks is what
// went out. One panel at a time; opening it for another proposal replaces
// the last.

import { aboutLabel, clock, ListenEngine, type ListenState } from "@/components/portal/listen-engine";

type Target = { publicId: string; title: string; client: string };

let panel: HTMLElement | null = null;
let engine: ListenEngine | null = null;
let current: string | null = null;

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ICON = {
  play: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>',
  again: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.3 4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M5 3v6h6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  wait: '<svg class="plisten-spin" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="40 20"/></svg>',
};

export function closeListenPanel(): void {
  engine?.destroy();
  engine = null;
  current = null;
  panel?.remove();
  panel = null;
}

/** Open (or re-open) the panel for one proposal and start loading. */
export function openListenPanel(host: HTMLElement, t: Target): void {
  if (current === t.publicId && panel && engine) {
    void engine.toggle();
    return;
  }
  closeListenPanel();
  current = t.publicId;
  const el = document.createElement("div");
  el.className = "plisten";
  el.setAttribute("role", "region");
  el.setAttribute("aria-label", "Listen to the proposal");
  el.innerHTML =
    '<div class="plisten-h">' +
    '<svg class="ic" aria-hidden="true"><use href="#i-mic"/></svg>' +
    '<span class="plisten-t"><b>Listen · what the client hears</b><i title="' + esc(t.title) + '">' + esc(t.title) + (t.client ? " · " + esc(t.client) : "") + "</i></span>" +
    '<button class="plisten-x" type="button" aria-label="Close">×</button>' +
    "</div>" +
    '<div class="plisten-b">' +
    '<button class="plisten-btn" type="button" aria-label="Play">' + ICON.wait + "</button>" +
    '<div class="plisten-m"><div class="plisten-s" aria-live="polite">Loading…</div><div class="plisten-bar"><span style="width:0%"></span></div></div>' +
    "</div>";
  host.appendChild(el);
  panel = el;

  const btn = el.querySelector<HTMLButtonElement>(".plisten-btn")!;
  const status = el.querySelector<HTMLElement>(".plisten-s")!;
  const bar = el.querySelector<HTMLElement>(".plisten-bar")!;
  const fill = bar.querySelector<HTMLElement>("span")!;

  const paint = (s: ListenState) => {
    const started = s.status === "playing" || s.status === "paused" || s.status === "ended";
    btn.disabled = s.status === "loading";
    btn.innerHTML = s.status === "loading" ? ICON.wait : s.status === "playing" ? ICON.pause : s.status === "ended" || s.status === "error" ? ICON.again : ICON.play;
    btn.setAttribute("aria-label", s.status === "playing" ? "Pause" : "Play");
    el.classList.toggle("is-error", s.status === "error");
    status.textContent =
      s.status === "loading" ? "Loading…"
      : s.status === "error" ? s.error ?? "Couldn't load the audio."
      : s.status === "ended" ? "Played to the end · " + aboutLabel(s.seconds).toLowerCase()
      : started ? clock(s.at) + " / " + clock(s.seconds) + (s.mode === "device" ? " · read by this device (no voice model configured)" : s.status === "paused" ? " · paused" : "")
      : aboutLabel(s.seconds);
    bar.style.display = started ? "" : "none";
    fill.style.width = Math.round(s.progress * 100) + "%";
  };

  engine = new ListenEngine(t.publicId, { title: t.title, artist: t.client }, paint);
  btn.addEventListener("click", () => void engine?.toggle());
  bar.addEventListener("click", (e) => {
    const r = bar.getBoundingClientRect();
    engine?.seek((e.clientX - r.left) / r.width);
  });
  el.querySelector(".plisten-x")?.addEventListener("click", closeListenPanel);
  void engine.toggle();
}
