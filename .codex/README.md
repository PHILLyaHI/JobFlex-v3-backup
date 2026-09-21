# Codex in JobFlex v3

Open `C:\joblfex-v3` as a project in the Codex desktop app, trust the folder when prompted, and start a new task there. Restart Codex if newly installed plugins or skills are missing. Changing a shell command's working directory does not move an existing task into this project.

## Project files

- `AGENTS.md` is Codex's project instruction file, adapted from `CLAUDE.md`. It preserves the project's safety, design, mobile, scope, Git, and Next.js rules.
- `.agents/skills/` contains the project versions of `frontend-design`, `jobflex-page-styler`, and `mobile-app-ui-design`, plus the migrated `$source-command-fleet` command. Hand-authored references and the dashboard asset were copied unchanged.
- `.codex/config.toml` registers the MCP servers below. It contains no credentials or model override.
- Claude's instructions, settings, skills, and `.mcp.json` are preserved. Update shared rules deliberately in both instruction files; do not rerun the raw migrator over the adapted files without reviewing its diff.

No application dependency changes are required. Existing Node.js and npm run the local MCP packages through `npx`; packages are cached outside the application. The checked Node runtime is 24.11.1. Local MCP versions are pinned for repeatable setup; review and test version changes before updating them.

## MCP verification

Checked on 2026-09-12 using MCP initialization and tool listing. These checks establish server connectivity and tool discovery, not browser rendering or authenticated business operations.

| Server | Configuration | Result |
| --- | --- | --- |
| Context7 | HTTPS | Passed; 2 documentation tools |
| Exa | HTTPS | Passed; 2 search/fetch tools |
| Playwright | `@playwright/mcp@0.0.80` via Windows `cmd.exe` / `npx.cmd` | Passed; 24 browser tools |
| Chrome DevTools | `chrome-devtools-mcp@1.9.0` via Windows `cmd.exe` / `npx.cmd` | Passed; 29 browser tools |
| context-mode | `context-mode@1.0.151` via Windows `cmd.exe` / `npx.cmd` | Disabled: first install hit an npm cache-lock error; an allowed retry timed out in postinstall |
| Vercel | HTTPS | Endpoint requires authentication (HTTP 401) |
| PostHog | HTTPS | Endpoint requires authentication (HTTP 401) |

After opening and trusting this project, use `/mcp` in an interactive Codex CLI session to inspect connections. From a terminal in this folder, authenticate the direct servers as needed:

```powershell
codex mcp login vercel
codex mcp login posthog
```

Complete account authorization in the browser; credentials stay in Codex's credential storage. Claude connector logins do not establish Codex connector access. CLI `codex mcp list` is configuration/authentication inventory, not a connection smoke test. This setup does not persist a project-trust override; trust the folder in Codex before expecting its project configuration to load.

context-mode remains disabled. Inspection traced the first `ECOMPROMISED` error to npm's cache-lock maintenance code, not a reported package checksum failure. An approved retry downloaded the package and built SQLite, then exceeded the 120-second probe timeout during postinstall. Automatic approval review rejected a longer installation because the installer includes logic capable of changing global Claude settings. Finish that installation only after explicit user approval, verify its MCP handshake, then enable its config entry. Do not bypass installation checks or import its hooks as a workaround.

Some server names were disabled in Claude's local settings. This Codex configuration enables the requested tools independently; it does not change Claude's settings. If a newly connected Codex plugin exposes the same service, select the connection you intend to use and avoid duplicate server entries.

## Shared skills and plugins

User-installed skills and plugins are shared across projects and should not be copied into application dependencies. Verified present: Impeccable and Visual Architect. Verified installed and enabled: Superpowers, Compound Engineering, Caveman, claude-mem, Build Web Apps, GitHub, Vercel, and PostHog. On this CLI build, explicitly select `--marketplace openai-curated` when checking that marketplace; the unfiltered plugin list can omit its installed entries.

GitHub, Vercel, and PostHog plugin installation does not prove account access. Connect their accounts in Codex when needed. Gmail, Google Calendar, Google Drive, Higgsfield, and Mobbin sessions from Claude are not migrated or verified here. Firecrawl, Stripe, and the 21st.dev Magic server remain outside this verified setup because their earlier authentication/API-key problems have not been resolved. Never copy secret values from Claude configuration into repository files.

The fleet skill displays the existing script's Claude workflow logs. Codex has native subagents; they do not appear in that script's dashboard. No custom project subagents or hooks were present to migrate. context-mode is configured for MCP tools only; Claude hook behavior is not imported. Existing global plugin hooks remain subject to Codex's own support and trust settings.

## Validation and maintenance

The migration validator passed TOML parsing, local command discovery, all four skill headers, and instruction-file size checks. No app build or database command is needed for these configuration-only changes. Keep `DESIGN.md` authoritative when generic design skills conflict with JobFlex conventions.

Official references: [Codex project MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [Codex skill discovery](https://learn.chatgpt.com/docs/build-skills).
