# CX Orchestrator Docs Index

This directory is the project-local knowledge base for maintaining and operating the CX Orchestrator plugin.

## Start Here

- [architecture.md](architecture.md): system structure, role split, control flow.
- [operation.md](operation.md): how to use the plugin from CodexApp and how to inspect logs.
- [cx1-policy.md](cx1-policy.md): CX1 behavior, approval gate, Human interaction policy.
- [cx2-controller.md](cx2-controller.md): MCP tools, statuses, logs, config, validation.
- [roadmap.md](roadmap.md): post-release backlog candidates and issue drafts.

## Project-Level Files

- `../AGENTS.md`: project rules for all agents.
- `../README.md`: high-level project entrypoint.
- `../CHANGELOG.md`: version history.
- `../.codex/policies/CODEX_POLICY.md`: Codex-specific maintenance policy.
- `../.codex/skills/cx-orchestrator-maintainer/SKILL.md`: repo-local skill for future maintenance.

## Current Confirmed Runtime Facts

- The plugin root is the local clone of this repository.
- The plugin is registered through a local Codex plugin marketplace.
- `~/.agents/plugins/marketplace.json` can point to `./plugins/cx-orchestrator` under the chosen local marketplace root.
- `~/.codex/config.toml` must enable `[plugins."cx-orchestrator@local"]`.
- CX2 execution uses `/opt/homebrew/bin/codex`, not PATH `codex`.
- The tested Homebrew CodexCLI version during initial setup was `0.130.0`.
- `/opt/homebrew/bin/codex mcp-server` exposes MCP tools named `codex` and `codex-reply`.
- `cx2_wait_task` is the standard monitoring path from `0.1.1`.
- Explicit CX2 model settings are supported from `0.1.2`; automatic CX1 model detection is not.
- CX1 selects and displays CX2 runtime before each task from `0.1.5`: model, reasoning effort, and speed.
- `speed_tier: "fast"` maps to CodexCLI `service_tier = "fast"`; standard speed omits `service_tier`.
- Full logs are stored outside the project at `~/.codex/cx-orchestrator/tasks/`.

## Maintenance Rule

When this plugin changes, update docs at the same time if any of these change:

- public MCP tools
- task statuses
- log files
- config keys
- approval policy
- CX1/CX2 role boundary
- installation or marketplace registration steps
- validation commands
