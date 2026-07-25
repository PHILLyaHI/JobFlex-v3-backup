# JobFlex-Video-

## Claude Code environment

This project is developed with [Claude Code](https://claude.com/claude-code). On a fresh clone, run:

```
bash scripts/setup-claude-env.sh
```

This adds the 4 plugin marketplaces used on this project and installs the 6 plugins from them (skill-creator, superpowers, frontend-design, context-mode, claude-mem, impeccable), then restart Claude Code. `impeccable` runs the design-quality hooks; `DESIGN.md` is hand-authored (the Blueprint system — product context + visual spec, synced from the `jobflex-page-styler` skill in `.claude/skills/`) — do not regenerate it with `/impeccable document`. Project-scoped skills (`frontend-design`, `jobflex-page-styler`) are checked into `.claude/skills/` and need no setup.

Two things this script deliberately does **not** do, because they can't be reproduced by cloning a repo:

- **MCP servers that need an API key/token** (e.g. a GitHub MCP server) — add your own with `claude mcp add <name> <command> -e KEY=value`. Never commit a token to this repo; `claude_mcp_config.json`-style files with embedded secrets stay local only.
- **claude.ai connectors** (Gmail, Google Calendar, Google Drive, Mobbin, Stripe, etc.) — these are tied to your Anthropic account, not this repo. Authorize each one once per device from claude.ai's connector settings.
