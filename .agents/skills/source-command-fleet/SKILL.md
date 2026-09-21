---
name: source-command-fleet
description: Show JobFlex's existing fleet dashboard for Claude workflow logs when the user asks about fleet or Claude workflow progress. Does not monitor Codex subagents.
---

# Fleet dashboard

Adapted from `.claude/commands/fleet.md`. Invoke as `$source-command-fleet`.

1. Run `node scripts/fleet.js` with the working directory set to the JobFlex repository. This reads existing Claude workflow logs; it does not launch agents.
2. Translate user-requested options into separate arguments. Supported selectors include `--list`, `--live`, `--all`, or a workflow ID. Check the script's documented options if unclear. Do not execute arbitrary user text as shell code.
3. With no arguments, show the newest run. Use `--live` when the user wants all working fleets. Default to a single snapshot; use `--watch` only when the user explicitly requests an ongoing terminal view.
4. Show the actual command output verbatim in a fenced code block. Do not invent agent results or progress. Report a missing log/run as such.

After the output, add at most two short lines when supported by the output:
- If the run is unfinished, give the finished/total count. A completed phase does not prove the full workflow finished.
- A `thinking` status can indicate a quiet model call; it does not by itself establish a stuck agent.

This script reads Claude's workflow journals under the user's `.claude` directory. For Codex subagent status, use the native Codex agent tools available in the task instead. The original command's argument placeholders, shell interpolation, and Claude tool allowlist are intentionally replaced with these explicit instructions.
