"use client";

// Blueprint messages — page CONTENT only. The donor's `.content` children,
// verbatim (jobflex-messages-blueprint_1.html); the sidebar, topbar and sprite
// come from the shared shell (components/v3/blueprint-shell), which persists
// across navigation. Dynamic regions (#convList, #thHead, #thBody and
// #memberList) are left empty exactly like the donor and filled by the ported
// script on mount — same architecture, same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.
//
// One structural adaptation: the donor mounts the new-conversation dialog
// (`.mdl#convMdl`) as a sibling of `.main`, outside `.content`. The port has
// only `.content` to render into, so the dialog ships as the LAST child here —
// the same move the Clients port made. Two consequences are handled explicitly:
// the reveal cascade skips `.mdl` (messages-behavior.ts) so `.rv` cannot strand
// the fixed overlay at `opacity: 0`, and `.content` drops its `z-index` while a
// dialog is open (messages.module.css) so the overlay still resolves above the
// sticky topbar. `position: fixed` keeps it out of the flex flow either way, so
// layout and the `gap: 22px` rhythm are untouched.

import { useCallback, useRef } from "react";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initMessagesContent } from "./messages-behavior";
import type { Conv, Member } from "./messages-data";

/**
 * @param conversations the viewer's real threads, read in the page's server
 *   component. The behavior module takes them as its starting state and then
 *   keeps itself in step with the database through the message server actions.
 */
export function MessagesContent({
  conversations,
  team,
  meName,
  activeId,
}: {
  conversations: Conv[];
  team: Member[];
  meName: string;
  activeId: string | null;
}) {
  // The seed reaches `init` through a ref, NOT through the callback's deps.
  // `useBlueprintContent` re-runs whenever `init` changes identity, and a re-run
  // tears the page down and replays the whole reveal cascade — so the init has
  // to stay referentially stable for the life of the mount. The ref is seeded on
  // the first render and never written again: from then on the behavior module
  // owns the inbox and keeps itself in step with the database. Navigating away
  // unmounts this component, so the next visit gets freshly-queried rows.
  const seedRef = useRef({ conversations, team, meName, activeId });

  const init = useCallback((content: HTMLElement) => initMessagesContent(content, seedRef.current), []);
  useBlueprintContent(init);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Communication</div>
          <h1 className="page-title">Messages</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" id="newConvBtn">
            <svg className="ic">
              <use href="#i-plus" />
            </svg>
            New chat
          </button>
        </div>
      </div>

      <div className="mx">
        {/* LEFT: conversation list */}
        <div className="card mx-list">
          <div className="mx-search">
            <svg className="ic">
              <use href="#i-search" />
            </svg>
            <input
              type="text"
              id="convSearch"
              placeholder="Search conversations…"
              autoComplete="off"
            />
          </div>
          <ul className="conv" id="convList"></ul>
          <div className="conv-empty is-hidden" id="convEmpty">No conversations</div>
        </div>

        {/* RIGHT: thread */}
        <div className="card mx-thread">
          <div className="th-head" id="thHead"></div>
          <div className="th-body" id="thBody"></div>
          {/* Server actions reject with messages written for the user ("You can
              only reply in your own threads.", the plan-limit copy). This is
              where the thread's writes surface them instead of failing silent. */}
          <div className="mx-err is-hidden" id="sendErr" role="alert"></div>
          {/* EDIT MODE STRIP — not in the donor. Shown while one of the viewer's
              own messages is loaded into the composer for editing
              (messages-behavior.ts enterEdit/exitEdit); names the mode and
              offers the keyboard-free way out. Styled INLINE off the donor's
              tokens on purpose: it must render correctly even when a hot
              reload delivers markup ahead of stylesheets (the failure mode
              the owner hit twice). JS toggles style.display directly. */}
          <div
            id="editBar"
            style={{
              display: "none",
              flex: "0 0 auto",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 9,
              padding: "6px 13px",
              borderTop: "1.5px dashed var(--hair)",
              background: "var(--paper-deep)",
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--blueprint)",
            }}
          >
            <span>Editing message</span>
            {/* padding lives in .msg-editcancel (messages.module.css), not
                inline: the ≤860px rule must be able to grow the tap box. */}
            <button
              type="button"
              id="editCancel"
              className="msg-editcancel"
              style={{
                border: 0,
                background: "none",
                font: "inherit",
                letterSpacing: "inherit",
                textTransform: "inherit",
                color: "var(--muted)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
          <div className="th-composer" id="thComposer">
            <textarea
              id="msgBox"
              rows={1}
              placeholder="Write a message… (Enter to send, Shift+Enter for new line)"
            />
            <button className="send-btn" type="button" id="sendBtn" aria-label="Send message">
              <svg className="ic">
                <use href="#i-send" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div className="pmenu pmenu--row" id="pMenu"></div>

      {/* NEW CONVERSATION DIALOG — the donor mounts this beside `.main`; see the
          file header for why it lands here instead. Markup is verbatim except
          two owner requests (2026-08-13): no offset shadow on the box (inline,
          not only in the stylesheet — this page's CSS module has repeatedly
          gone stale in the owner's tab while JS chunks refresh fine), and the
          footer buttons at the page-action height (no `btn--sm`; the base
          `.btn` 40px — the same box as the page head's "New message"). */}
      <div className="mdl" id="convMdl">
        <div className="mdl-bg" data-mdl="close"></div>
        <div className="mdl-box" style={{ boxShadow: "none" }}>
          <div className="mdl-head">
            <div className="mdl-title" id="mdlTitle">New conversation</div>
            <div className="mdl-sub" id="mdlSub">Pick someone on the crew.</div>
          </div>
          <div className="mdl-body">
            <div className="mx-search mdl-search">
              <svg className="ic">
                <use href="#i-search" />
              </svg>
              <input
                type="text"
                id="memberSearch"
                placeholder="Search the team…"
                autoComplete="off"
              />
            </div>
            <ul className="members" id="memberList"></ul>
            <label className="grp-title is-hidden" id="grpTitleWrap">
              <span className="est-lbl">Group name (optional)</span>
              <input className="est-in" id="grpTitle" placeholder="Maple Ave crew" />
            </label>
            <div className="mx-err mx-err--mdl is-hidden" id="convErr" role="alert"></div>
          </div>
          <div className="mdl-foot">
            <button className="btn btn-ghost" type="button" data-mdl="close">
              Cancel
            </button>
            <button className="btn btn-primary" type="button" id="startBtn" disabled>
              Start
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
