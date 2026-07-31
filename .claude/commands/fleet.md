---
description: Watch what the running workflow's agents are doing (live terminal view)
argument-hint: "[--live] [--watch] [--list] [--all] [wf_<id>]"
allowed-tools: Bash(node scripts/fleet.js:*)
---

Run the fleet dashboard and show the user its output **verbatim**, inside a
fenced code block. Do not summarise it, do not re-describe the table in prose,
and do not add commentary about what the agents are "probably" doing — the
table is the answer.

```
!`node scripts/fleet.js $ARGUMENTS`
```

With no arguments this shows the NEWEST run only. When more than one fleet is
out at once — two chats on one checkout, or a follow-up batch launched while the
first is still going — pass `--live` to stack every working fleet in one board.
Each fleet keeps its own progress bar; there is no combined total, because
"14/22" across two unrelated batches would not mean anything.

After the output, add at most two short lines, and only if they are true:

- If the run is NOT finished, say so plainly and give the finished/total count.
  A completed PHASE is not a completed run: `parallel()` is a barrier, so a
  phase reaching n/n is exactly when the next phase spawns. Never call a run
  done because one phase is.
- If any agent shows `thinking` (quiet 2+ minutes), note that it is most likely
  mid-model-call rather than stuck.

Never invent agent results. The dashboard reports activity — transcript size,
last tool, elapsed — not conclusions. An agent's actual return value only exists
once its result lands in `journal.jsonl`.
