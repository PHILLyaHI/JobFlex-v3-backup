#!/usr/bin/env node
// JOBFLEX - AUTOMATION FLEET
//
// A live terminal view of what a running Workflow's agents are actually doing.
//
// Everything here is derived from the workflow's own transcript directory -
// nothing is instrumented and nothing is written, so this is safe to run against
// a live run. Per agent it reads:
//   agent-<id>.jsonl       the full conversation (streamed as it happens)
//   journal.jsonl          `started` / `result` events, keyed by agentId
//
// The agent LABEL is not persisted anywhere, so the page name is inferred from
// the prompt text against a keyword table (see PAGES). That is the one heuristic
// in the file; everything else is measured.
//
// Usage:
//   node fleet.js                 latest run, single snapshot
//   node fleet.js --watch         refresh every 2s until every agent is done
//   node fleet.js wf_2cd92dbe-1f7 a specific run id
//   node fleet.js --list          show recent runs
//   node fleet.js --live          EVERY run still working, stacked in one view
//
// `--live` exists because a single repo can have more than one fleet out at
// once — two chats working the same checkout, or a follow-up batch launched
// while the first is still going. Picking "the latest run" then shows one of
// them and silently hides the other. A run counts as live if any of its agents
// wrote inside LIVE_MS; finished and abandoned runs drop out on their own.

const fs = require("fs");
const path = require("path");
const os = require("os");

// -- liveness thresholds ---------------------------------------------
// How long an agent may be silent before the display stops calling it healthy.
//
// Calibrated against what these agents actually do: a model call is seconds, a
// full `npx tsc --noEmit` on this repo is a couple of minutes, and past five
// minutes of total silence an agent has never once woken up again.
//
// The original build had a single 2-minute "thinking" state that never
// escalated, so three agents dead for 43 minutes still displayed as busy and
// the run looked healthy while nothing at all was happening. A liveness
// indicator that cannot distinguish 2 minutes from 43 is worse than none,
// because it is actively reassuring.
const SLOW_MS = 90 * 1000;
const STALL_MS = 5 * 60 * 1000;
// How recently a run must have written for `--live` to still show it. Generous
// on purpose: a max-effort agent can think for several minutes between tool
// calls, and dropping it off the board would be the same lie the stall bands
// were added to prevent.
const LIVE_MS = 15 * 60 * 1000;

// -- locating runs ---------------------------------------------------
// Workflow transcripts live beside the session, under a per-project folder whose
// name is the cwd with separators and colons flattened to dashes.
//
// This folder is keyed to the PROJECT, not the session — several Claude Code
// sessions on the same repo write runs side by side. Defaulting to "newest run
// anywhere" therefore latched onto whichever session last wrote, which is how a
// 13-agent run from a parallel session appeared while a 4-agent run was the one
// being watched. The default is now this repo only; `--all` widens it.
function projectKey(dir) {
  return dir.replace(/[\\/:]/g, "-");
}

function projectRoots(all) {
  const base = path.join(os.homedir(), ".claude", "projects");
  if (!fs.existsSync(base)) return [];
  const mine = projectKey(process.cwd());
  const out = [];
  for (const proj of fs.readdirSync(base)) {
    const p = path.join(base, proj);
    if (!fs.statSync(p).isDirectory()) continue;
    // Case-insensitive: Windows hands back the drive letter in either case, so
    // "C--Users-..." and "c--Users-..." are the same project.
    if (!all && proj.toLowerCase() !== mine.toLowerCase()) continue;
    for (const sess of fs.readdirSync(p)) {
      const wf = path.join(p, sess, "subagents", "workflows");
      if (fs.existsSync(wf)) out.push({ dir: wf, project: proj, session: sess });
    }
  }
  return out;
}

function findRuns(all) {
  const runs = [];
  for (const root of projectRoots(all)) {
    for (const dir of fs.readdirSync(root.dir)) {
      const full = path.join(root.dir, dir);
      if (!dir.startsWith("wf_") || !fs.statSync(full).isDirectory()) continue;
      const journal = path.join(full, "journal.jsonl");
      const agentFiles = fs.readdirSync(full).filter((f) => /^agent-.*\.jsonl$/.test(f));
      // Liveness is measured off the AGENT transcripts, not the journal: the
      // journal only gains a line when an agent starts or finishes, so a fleet
      // deep in the middle of its work has a journal that has not moved in ten
      // minutes while every agent is writing constantly.
      let active = 0;
      for (const f of agentFiles) {
        const m = fs.statSync(path.join(full, f)).mtimeMs;
        if (m > active) active = m;
      }
      runs.push({
        id: dir,
        dir: full,
        agents: agentFiles.length,
        session: root.session,
        active,
        mtime: fs.existsSync(journal) ? fs.statSync(journal).mtimeMs : 0,
      });
    }
  }
  return runs.sort((a, b) => b.mtime - a.mtime);
}

// -- label inference -------------------------------------------------
// Ordered: the first match wins, so put specific terms above generic ones.
const PAGES = [
  [/smart proposal|advanced-ai|clarifying/i, "Smart Proposal"],
  [/roof/i, "Roof estimator"],
  [/fence/i, "Fence estimator"],
  [/topbar|command.?palette|cmd.?k|search bar/i, "Topbar search"],
  [/scroll|fluid scale|shell/i, "Shell / scroll"],
  [/date.?picker|dropdown|<select/i, "Dropdowns"],
  [/calendar/i, "Calendar"],
  [/announcement/i, "Announcements"],
  [/trade board|trade-blueprint/i, "Trade board"],
  [/referral/i, "Referrals"],
  [/report/i, "Reports"],
  [/review/i, "Reviews"],
  [/phone/i, "Phone"],
  [/message/i, "Messages"],
  [/financial|expense|receipt/i, "Financials"],
  [/company|crm/i, "Company / CRM"],
  [/lead/i, "Leads"],
  [/worker/i, "Workers"],
  [/job/i, "Jobs"],
  [/client/i, "Clients"],
  [/project/i, "Projects"],
];

function labelFor(prompt) {
  // An explicit marker beats every heuristic. Agents that share a long common
  // preamble (house rules, shared-helper docs) otherwise all score on the same
  // incidental words in it — eight build agents each owning a different page
  // all came out as "Shell / scroll" because the preamble discusses the shell.
  const tagged = /^[ \t]*PAGE:[ \t]*([^\n(]+)/im.exec(prompt);
  if (tagged) return tagged[1].trim().replace(/\s*\($/, "").slice(0, 18);

  // Otherwise score every page and take the strongest signal, not merely the
  // first — a prompt naming several pages should land on the one it is about.
  let best = null;
  let bestN = 0;
  for (const [re, name] of PAGES) {
    const g = new RegExp(re.source, "gi");
    const n = (prompt.match(g) || []).length;
    if (n > bestN) {
      bestN = n;
      best = name;
    }
  }
  return best || "-";
}

// -- transcript parsing ----------------------------------------------
function readAgent(dir, file) {
  const full = path.join(dir, file);
  const id = file.replace(/^agent-|\.jsonl$/g, "");
  const size = fs.statSync(full).size;

  let text;
  try {
    text = fs.readFileSync(full, "utf8");
  } catch {
    return null;
  }

  const lines = text.split(/\r?\n/);
  const files = new Set();
  let prompt = "";
  let firstTs = null;
  let lastTs = null;
  let lastTool = "";
  let toolCalls = 0;
  let thinking = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      // The tail of a live file is often a half-written line. Expected.
      continue;
    }
    if (o.timestamp) {
      const t = Date.parse(o.timestamp);
      if (!isNaN(t)) {
        if (firstTs === null || t < firstTs) firstTs = t;
        if (lastTs === null || t > lastTs) lastTs = t;
      }
    }
    // The opening user turn carries the prompt as a plain string.
    if (!prompt && o.type === "user" && typeof o.message?.content === "string") {
      prompt = o.message.content;
    }
    const content = o.message?.content;
    if (o.type === "assistant" && Array.isArray(content)) {
      for (const c of content) {
        if (c.type === "thinking") thinking += 1;
        if (c.type !== "tool_use") continue;
        toolCalls += 1;
        lastTool = c.name || lastTool;
        const inp = c.input || {};
        const p = inp.file_path || inp.path || inp.notebook_path;
        if (typeof p === "string" && p) {
          files.add(path.basename(p));
          continue;
        }
        // Everything else is still a "look" - count the distinct thing looked at,
        // so an agent that works through Grep or batched shell does not read as
        // idle. Without these branches a Grep-only agent showed 0 files.
        if (inp.pattern) files.add("~" + String(inp.pattern).slice(0, 18));
        else if (inp.command) files.add("$" + String(inp.command).slice(0, 24));
        else if (Array.isArray(inp.commands)) {
          for (const cmd of inp.commands) files.add("$" + String(cmd.command || cmd.label || "").slice(0, 24));
        } else if (Array.isArray(inp.queries)) {
          for (const q of inp.queries) files.add("?" + String(q).slice(0, 20));
        }
      }
    }
  }

  return {
    id,
    size,
    prompt,
    label: labelFor(prompt),
    phase: phaseFor(prompt),
    files: files.size,
    toolCalls,
    thinking,
    firstTs,
    lastTs,
    lastTool,
  };
}

// The workflow does not persist which phase an agent belongs to, but the phases
// give their agents structurally different prompts, so the prompt identifies it.
// Without this the whole run reads as one flat list — and a barrier phase
// completing then looks exactly like the RUN completing, which is misleading.
function phaseFor(prompt) {
  if (/try to refute|default to refuted/i.test(prompt)) return "Verify";
  // Mapping prompts open by naming the repo root. Matching the verb instead
  // ("read"/"find"/"investigate") missed the ones phrased as "the user wants…".
  if (/^\s*in\s+[a-z]:[\\/]/i.test(prompt)) return "Map";
  return "Work";
}

function readJournal(dir) {
  const f = path.join(dir, "journal.jsonl");
  const done = new Set();
  const started = new Set();
  if (!fs.existsSync(f)) return { done, started };
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.type === "started" && o.agentId) started.add(o.agentId);
    if (o.type === "result" && o.agentId) done.add(o.agentId);
  }
  return { done, started };
}

// -- rendering -------------------------------------------------------
const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  amber: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

function dur(ms) {
  if (ms === null || ms === undefined || isNaN(ms)) return "-";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m";
  return Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0");
}

function clock(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

function bar(frac, width) {
  const n = Math.max(0, Math.min(width, Math.round(frac * width)));
  return "#".repeat(n) + ".".repeat(width - n);
}

function pad(s, n) {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n - 1) + ".." : s.padEnd(n);
}

function render(run) {
  const { done, started } = readJournal(run.dir);
  const all = fs
    .readdirSync(run.dir)
    .filter((f) => /^agent-.*\.jsonl$/.test(f))
    .map((f) => readAgent(run.dir, f))
    .filter(Boolean)
    .sort((a, b) => (a.firstTs ?? 0) - (b.firstTs ?? 0));

  const now = Date.now();
  const t0 = Math.min(...all.map((a) => a.firstTs ?? now));

  // A resumed run keeps its dead agents' transcripts, so after a recovery the
  // table carries two generations: corpses that can never finish, and the live
  // agents that replaced them. Left in, they pinned the progress bar at a
  // permanently pessimistic number (4/8 = 50% when the real answer was 4/4) and
  // buried the rows that matter.
  //
  // They are HIDDEN, not forgotten: the count still appears in the header and
  // the red stall banner below still fires. Suppressing the rows while silently
  // dropping the warning would repeat the exact failure this display already
  // had once — looking calm while something was wrong.
  const isCorpse = (a) =>
    !done.has(a.id) && started.has(a.id) && a.lastTs && now - a.lastTs > STALL_MS;
  const corpses = all.filter(isCorpse);
  const agents = showStalled ? all : all.filter((a) => !isCorpse(a));

  const finished = agents.filter((a) => done.has(a.id)).length;

  const L = [];
  L.push("");
  L.push("  " + C.bold("JOBFLEX - AUTOMATION FLEET") + "                      " + C.dim("run " + run.id));
  L.push("  " + C.dim("-".repeat(63)));
  L.push(
    "  elapsed " +
      C.bold(clock(now - t0)) +
      "".padEnd(28) +
      C.dim("agents ") +
      agents.length +
      C.dim(" - finished ") +
      (finished === agents.length ? C.green(String(finished)) : C.amber(String(finished))),
  );
  L.push("");
  L.push(
    C.dim(
      "  " + pad("PAGE", 18) + pad("AGENT", 11) + pad("STATUS", 11) + pad("ACTIVITY", 13) + pad("SIZE", 8) + "LAST",
    ),
  );
  L.push(C.dim("  " + pad("----", 18) + pad("-----", 11) + pad("------", 11) + pad("-----", 13) + pad("----", 8) + "----"));

  // Group by phase, in the order the phases actually began.
  const phases = [];
  for (const a of agents) {
    let g = phases.find((x) => x.name === a.phase);
    if (!g) phases.push((g = { name: a.phase, rows: [] }));
    g.rows.push(a);
  }

  for (const g of phases) {
    const gDone = g.rows.filter((r) => done.has(r.id)).length;
    const label = g.name + "  " + gDone + "/" + g.rows.length;
    L.push(
      "  " +
        C.dim("- ") +
        (gDone === g.rows.length ? C.green(C.bold(label)) : C.amber(C.bold(label))) +
        C.dim(" " + "-".repeat(Math.max(0, 58 - label.length))),
    );
    for (const a of g.rows) renderRow(a);
    L.push("");
  }

  function renderRow(a) {
    const isDone = done.has(a.id);
    const idle = a.lastTs ? now - a.lastTs : 0;

    // STALL DETECTION. This used to top out at "thinking" after 2 minutes and
    // never escalate — so three agents that had been dead for 43 MINUTES still
    // read as busy, and the run looked healthy while nothing was happening.
    //
    // The bands are calibrated against what these agents actually do: a model
    // call is seconds, a long `npx tsc --noEmit` on this repo is a couple of
    // minutes, and anything past five minutes of total silence has never once
    // been an agent that later woke up.
    const status = isDone
      ? C.green("done")
      : !started.has(a.id)
        ? C.dim("queued")
        : idle > STALL_MS
          ? C.red("STALLED")
          : idle > SLOW_MS
            ? C.amber("slow")
            : C.blue("working");

    // ACTIVITY, not progress. This column used to be a filled bar plus "18/20",
    // which reads as 90% done — it is nothing of the kind, it is "distinct
    // things this agent looked at, scaled against the busiest agent in the run".
    // A finished agent and a working one both showing 18 looked identical.
    // Now: a plain count, and the bar is gone.
    const looks = String(a.files).padStart(3) + " looks";
    const last = (a.lastTool || "-") + " " + (idle > STALL_MS ? C.red(dur(idle) + " ago") : C.dim(dur(idle) + " ago"));

    L.push(
      "  " +
        pad(a.label, 18) +
        C.dim(pad(a.id.slice(0, 8), 11)) +
        // status carries colour codes, so pad on the visible text length
        status +
        " ".repeat(Math.max(1, 11 - status.replace(/\x1b\[[0-9;]*m/g, "").length)) +
        pad(looks, 13) +
        pad((a.size / 1024).toFixed(0) + " KB", 8) +
        last,
    );
  }

  L.push("");
  const pct = agents.length ? finished / agents.length : 0;
  L.push(
    "  " +
      C.bold(finished + "/" + agents.length + " agents complete") +
      "   [" +
      (pct === 1 ? C.green(bar(pct, 25)) : C.blue(bar(pct, 25))) +
      "] " +
      Math.round(pct * 100) +
      "%",
  );
  L.push("");
  // A phase barrier releasing looks identical to the run ending: every agent so
  // far is `done`, and the next phase's agents do not exist yet. Treat the run as
  // finished only once the journal has ALSO been quiet for a while, or --watch
  // exits in the gap between phases and reports a half-run as complete.
  const jStat = fs.statSync(path.join(run.dir, "journal.jsonl"));
  const quietMs = now - jStat.mtimeMs;
  const allDone = agents.length > 0 && finished === agents.length;
  const settled = allDone && quietMs > 25000;

  // A run-level alarm, so a stall cannot hide inside one row of a long table.
  // This is the line that was missing when three agents sat dead for 43 minutes
  // while the footer cheerfully reported "1/4 agents complete".
  //
  // It reads `corpses` (every stalled agent in the run) rather than the rows on
  // screen, so hiding the rows can never hide the warning.
  if (corpses.length) {
    const worst = Math.max(...corpses.map((a) => now - a.lastTs));
    const live = corpses.some((a) => now - a.lastTs < 15 * 60 * 1000);
    if (showStalled || live) {
      L.push(
        "  " +
          C.red(C.bold("!! " + corpses.length + " AGENT" + (corpses.length > 1 ? "S" : "") + " STALLED")) +
          C.red(" - silent for " + dur(worst) + ". They are not coming back on their own."),
      );
      L.push("  " + C.dim("     Ask Claude to resume the run; finished agents replay from cache."));
    } else {
      // Long dead and already replaced by a resume — a footnote, not an alarm.
      L.push(
        "  " +
          C.dim(
            corpses.length + " stalled agent" + (corpses.length > 1 ? "s" : "") +
              " from an earlier attempt hidden (" + dur(worst) + " silent) - --stalled to show",
          ),
      );
    }
    L.push("");
  }

  if (settled) {
    L.push("  " + C.green("All agents landed.") + C.dim("  Synthesis is next."));
  } else if (allDone) {
    L.push(
      "  " +
        C.amber("Phase barrier released") +
        C.dim(" - waiting to see whether the next phase spawns (" + dur(quietMs) + " quiet)"),
    );
  } else {
    const out = [...new Set(agents.filter((a) => !done.has(a.id)).map((a) => a.phase + ":" + a.label))];
    L.push("  " + C.dim("still out: ") + out.join(", "));
  }
  L.push("");
  return { text: L.join("\n"), complete: settled };
}

// -- entry -----------------------------------------------------------
const args = process.argv.slice(2);
const watch = args.includes("--watch");
const wantList = args.includes("--list");
const allProjects = args.includes("--all");
// Every run still being worked, rather than just the newest one.
const wantLive = args.includes("--live") || args.includes("--active");
// Corpses from a resumed run are hidden by default; this brings them back.
const showStalled = args.includes("--stalled") || args.includes("--all-agents");
// Accept every spelling people reach for: a bare id, `--run <id>`, `--run=<id>`,
// and a PREFIX rather than the full thing. Ids are long and nobody retypes them
// accurately; `--run wf_4491` should just work.
const runFlagIdx = args.findIndex((a) => a === "--run" || a === "-r");
const wanted =
  args.find((a) => a.startsWith("wf_")) ||
  (runFlagIdx !== -1 ? args[runFlagIdx + 1] : undefined) ||
  args.find((a) => a.startsWith("--run="))?.slice(6);

const runs = findRuns(allProjects);
if (!runs.length) {
  console.error("No workflow runs for this repo (" + process.cwd() + ").");
  console.error("  Run with --all to look across every project.");
  process.exit(1);
}

if (wantList) {
  console.log("");
  for (const r of runs.slice(0, 15)) {
    console.log("  " + r.id + "  " + String(r.agents).padStart(3) + " agents  " + C.dim(new Date(r.mtime).toLocaleString()));
  }
  console.log("");
  process.exit(0);
}

const wantResults = args.includes("--results");

// One run, or every live one. `targets` is always an array so the draw loop
// below has a single shape to handle.
let targets;
if (wantLive) {
  // Recomputed on every draw, not captured once: under --watch a fleet that
  // finishes should drop off the board, and one launched while watching should
  // appear. Seeded here so the empty case can be reported before the first draw.
  targets = findRuns(allProjects).filter((r) => Date.now() - r.active < LIVE_MS);
  if (!targets.length) {
    console.error("No fleet is currently working in this repo.");
    console.error("  Nothing has written in " + Math.round(LIVE_MS / 60000) + " minutes.");
    console.error("  `--list` shows recent runs; pass an id to open a finished one.");
    process.exit(1);
  }
} else {
  const run = wanted
    ? runs.find((r) => r.id === wanted) || runs.find((r) => r.id.startsWith(wanted))
    : runs[0];
  if (!run) {
    console.error("Run not found: " + wanted);
    console.error("  Known runs for this repo:");
    for (const r of runs.slice(0, 8)) console.error("    " + r.id + "  " + r.agents + " agents");
    process.exit(1);
  }
  targets = [run];
}

/**
 * What each finished agent actually RETURNED.
 *
 * The table above reports activity — transcript size, last tool, elapsed. It
 * deliberately says nothing about outcomes, because an agent that has been busy
 * for ten minutes may still have failed. The real answer only exists once a
 * `{"type":"result"}` line lands in journal.jsonl, and this prints those.
 *
 * `blocked` is printed as loudly as `done`: an agent reporting what it could NOT
 * do is the most useful line in its whole report, and it is the one a summary
 * is most likely to drop.
 */
function printResults(run) {
  const jf = path.join(run.dir, "journal.jsonl");
  if (!fs.existsSync(jf)) return console.log("  no journal yet\n");
  const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  let n = 0;
  for (const line of fs.readFileSync(jf, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.type !== "result" || !o.result) continue;
    const r = o.result;
    n += 1;
    const title = clean(r.page || r.task || r.item || o.agentId);
    console.log("\n  " + C.bold("### " + title.slice(0, 76)));
    if (Array.isArray(r.changed) && r.changed.length) {
      console.log("  " + C.dim("files: " + r.changed.map((f) => f.split("/").pop()).join(", ").slice(0, 150)));
    }
    for (const d of r.done || []) console.log("  " + C.green("+ ") + clean(d).slice(0, 155));
    for (const b of r.blocked || []) console.log("  " + C.amber("! ") + clean(b).slice(0, 155));
    if (r.verified) console.log("  " + C.dim("verified: " + clean(r.verified).slice(0, 150)));
  }
  if (!n) console.log("\n  " + C.dim("no agent has returned a result yet"));
  console.log("");
}

function draw() {
  // Re-read under --live so a fleet that finishes drops off and one that starts
  // appears, instead of the board being frozen to whatever was out at launch.
  const list = wantLive
    ? findRuns(allProjects).filter((r) => Date.now() - r.active < LIVE_MS)
    : targets;

  if (watch) process.stdout.write("\x1b[2J\x1b[H");

  let every = true;
  for (const run of list) {
    const { text, complete } = render(run);
    process.stdout.write(text + "\n");
    if (wantResults) printResults(run);
    if (!complete) every = false;
  }

  if (wantLive) {
    if (!list.length) {
      process.stdout.write(C.dim("  no fleet working right now\n"));
      return true;
    }
    if (list.length > 1) {
      // Two fleets in one checkout is normal here (two chats, one repo) but it
      // is worth saying out loud — the per-run progress bars above each count
      // only their own agents, and neither is "the" total.
      process.stdout.write(
        C.dim("  " + list.length + " fleets working in this repo - counts above are per-fleet\n"),
      );
    }
  }
  return every;
}

if (!watch) {
  draw();
} else {
  const tick = () => {
    if (draw()) {
      process.stdout.write(C.dim("  (run complete - exiting)\n"));
      process.exit(0);
    }
    setTimeout(tick, 2000);
  };
  tick();
}
