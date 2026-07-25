#!/usr/bin/env bash
# Reproduces this machine's Claude Code plugin environment on a fresh clone:
# adds the marketplaces this project's contributors use, then installs the
# plugins from them. No secrets or MCP tokens live here — those are per-device
# and per-account by design; see the "Claude Code environment" section in
# README.md for what still needs a manual step after this script runs.
set -e

marketplaces=(
  "anthropics/claude-plugins-official"
  "mksglu/context-mode"
  "thedotmack/claude-mem"
  "pbakaus/impeccable"
)

plugins=(
  "skill-creator@claude-plugins-official"
  "superpowers@claude-plugins-official"
  "frontend-design@claude-plugins-official"
  "context-mode@context-mode"
  "claude-mem@thedotmack"
  "impeccable@impeccable"
)

for m in "${marketplaces[@]}"; do
  echo "Adding marketplace: $m"
  claude plugin marketplace add "$m" || true
done

for p in "${plugins[@]}"; do
  echo "Installing plugin: $p"
  claude plugin install "$p" || true
done

echo
echo "Done — restart Claude Code to load the plugins."
echo "See README.md for the MCP servers / connectors this script intentionally skips."
