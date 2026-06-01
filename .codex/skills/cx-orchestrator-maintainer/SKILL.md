---
name: cx-orchestrator-maintainer
description: Use when maintaining the cx-orchestrator plugin project, including CX2 Controller MCP changes, CX1 orchestration policy updates, plugin metadata, docs, schemas, logging behavior, or local Codex plugin registration guidance.
---

# CX Orchestrator Maintainer

Use this skill when working inside the `cx-orchestrator` repository.

## Start

Read:

1. `AGENTS.md`
2. `.codex/policies/CODEX_POLICY.md`
3. `docs/INDEX.md`
4. the files directly related to the requested change

## Boundaries

Preserve these invariants:

- Human only talks to CX1.
- CX1 must show the exact CX2 prompt before dispatch.
- CX2 starts only from Human-approved prompt text.
- CX2 approval requests are routed back to CX1/Human.
- CX1 reviews CX2 results before reporting to Human.
- Full logs remain under `~/.codex/cx-orchestrator/tasks/`.
- `/opt/homebrew/bin/codex` is the default allowed Codex binary.
- `app-server` is not part of the `0.1.x` runtime path.

## Implementation Checklist

For controller changes:

1. Inspect `mcp/cx2-controller/src/server.mjs`.
2. Keep public tool compatibility unless a breaking change is explicitly requested.
3. Update schemas if input or output contracts change.
4. Update docs and changelog when behavior changes.
5. Run `node --check mcp/cx2-controller/src/server.mjs`.
6. Run `node mcp/cx2-controller/test/smoke.mjs`.
7. Run `node mcp/cx2-controller/test/wait.mjs` when wait or status behavior changes.
8. Run `node mcp/cx2-controller/test/model-settings.mjs` when model or reasoning behavior changes.

For CX1 policy changes:

1. Update `skills/cx1-orchestrator/SKILL.md`.
2. Update `docs/cx1-policy.md`.
3. Keep Human approval mandatory.

For plugin registration or metadata changes:

1. Update `.codex-plugin/plugin.json`.
2. Update `README.md` or `docs/operation.md` if user setup changes.
3. Validate JSON.

## Report Format

Return:

- changed files
- summary
- validation
- risks or unverified paths
- recommended next action
