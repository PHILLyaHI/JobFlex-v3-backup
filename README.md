# JobFlex-Video-

## Claude Code environment

This project is developed with [Claude Code](https://claude.com/claude-code). On a fresh clone, run:

```
bash scripts/setup-claude-env.sh
```

This adds the 3 plugin marketplaces used on this project and installs the 5 plugins from them (skill-creator, superpowers, frontend-design, context-mode, claude-mem), then restart Claude Code. A project-scoped skill (`frontend-design`) is already checked into `.claude/skills/` and needs no setup.

Two things this script deliberately does **not** do, because they can't be reproduced by cloning a repo:

- **MCP servers that need an API key/token** (e.g. a GitHub MCP server) — add your own with `claude mcp add <name> <command> -e KEY=value`. Never commit a token to this repo; `claude_mcp_config.json`-style files with embedded secrets stay local only.
- **claude.ai connectors** (Gmail, Google Calendar, Google Drive, Mobbin, Stripe, etc.) — these are tied to your Anthropic account, not this repo. Authorize each one once per device from claude.ai's connector settings.
