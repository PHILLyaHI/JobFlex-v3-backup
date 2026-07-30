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

import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initMessagesContent } from "./messages-behavior";

export function MessagesContent() {
  useBlueprintContent(initMessagesContent);

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
            New message
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
      <div className="pmenu" id="pMenu"></div>

      {/* NEW CONVERSATION DIALOG — the donor mounts this beside `.main`; see the
          file header for why it lands here instead. Markup is verbatim. */}
      <div className="mdl" id="convMdl">
        <div className="mdl-bg" data-mdl="close"></div>
        <div className="mdl-box">
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
          </div>
          <div className="mdl-foot">
            <button className="btn btn-ghost btn--sm" type="button" data-mdl="close">
              Cancel
            </button>
            <button className="btn btn-primary btn--sm" type="button" id="startBtn" disabled>
              <svg className="ic">
                <use href="#i-check" />
              </svg>
              Start
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
