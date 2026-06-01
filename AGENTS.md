# AGENTS.md

## Purpose

`cx-orchestrator` is a home-local Codex plugin that lets a CodexApp CX1 thread talk only with the Human while sending Human-approved CX2 instructions to a CodexCLI CX2 worker through MCP.

This repository keeps the source of truth for plugin implementation, operation, and verification under the project root.

## Role Split

- Human: Director / Product Owner. Reviews artifacts, makes product decisions, and approves gates.
- CX1: PM / Architect / QA Lead. Talks with the Human, drafts CX2 instructions, reviews CX2 results, and reports back to the Human.
- CX2: SE / Implementation Engineer. Performs only the task-scoped design, implementation, and verification work approved by the Human through CX1.

## Local Rules

1. In a new chat, read `README.md` and `docs/INDEX.md` first.
2. Before implementation changes, read `.codex/policies/CODEX_POLICY.md`.
3. For maintenance of this plugin itself, prefer `.codex/skills/cx-orchestrator-maintainer/SKILL.md`.
4. Before changing compatibility of the runtime plugin API, explain the impact area.
5. Do not add behavior that bypasses the Human approval gate.
6. Do not add automatic CX2 approval. Approval requests must be routed through CX1/Human.
7. Do not weaken full-log retention.
8. Before changing the fixed `/opt/homebrew/bin/codex` default, explain the reason and compatibility risk.
9. Before changing configuration files outside this repository, explain the target path and purpose.
10. Commit only when the Human explicitly asks.

## Language Policy

- Public-facing OSS artifacts should be written in English by default: `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, release notes, GitHub issues, pull requests, and public commit messages.
- Japanese documentation may be provided as a secondary translation, such as `README.ja.md`.
- CX must communicate proposals, risk explanations, review results, and completion reports to the Human in Japanese unless the Human explicitly requests another language.
- When the Human provides requirements in Japanese, CX should preserve the meaning and produce English public artifacts as needed.
- If a Japanese-only note is useful for local operation, keep it clearly separated from the English public artifact.

## Branch and Commit Policy

- `main` must stay publishable.
- Do not commit directly to `main` for normal maintenance work.
- Use a short English topic branch for changes, for example `docs/post-release-maintenance`, `feat/setup-check`, `test/approval-handling`, or `fix/retry-status-handling`.
- Keep one branch scoped to one logical change.
- Use `docs/` or `chore/` branches for repository maintenance, documentation, templates, and release preparation.
- Use `feat/` or `fix/` branches for runtime behavior changes.
- Use `test/` branches for test-only changes.
- Changes that affect compatibility, approval gates, approval routing, logging, or runtime behavior should go through a pull request, even for maintainer-owned work.
- Release tags must point only to validated `main` commits.
- Commit only when the Human explicitly asks.
- Public commit messages must be English Conventional Commits, for example `docs: add post-release maintenance templates`.

## Project Boundaries

### In Scope

- plugin manifest
- CX1 skill
- CX2 Controller MCP server
- controller config, schemas, and tests
- project-local docs, policies, and skills
- install and operation documentation

### Out of Scope Without Explicit Approval

- modifying CodexApp itself
- modifying CodexCLI itself
- `app-server` integration
- orchestration that depends on third-party SaaS
- CX2 dispatch without Human approval
- shell, patch, or tool approval without Human approval

## Verification

Minimum verification:

```sh
node --check mcp/cx2-controller/src/server.mjs
node mcp/cx2-controller/test/smoke.mjs
node mcp/cx2-controller/test/wait.mjs
node mcp/cx2-controller/test/model-settings.mjs
```

For JSON changes:

```sh
node -e 'for (const f of [".codex-plugin/plugin.json",".mcp.json","mcp/cx2-controller/config/defaults.json"]) JSON.parse(require("fs").readFileSync(f,"utf8")); console.log("json ok")'
```

For Codex integration changes, also check the smoke procedure in `docs/operation.md`.

## Completion Report

Completion reports to the Human should be concise and written in Japanese. Include:

1. changed files
2. summary
3. validation performed
4. open items or risks
5. next document or task to open
