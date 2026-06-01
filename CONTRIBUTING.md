# Contributing

CX Orchestrator is a local-first Codex plugin for Human-approved CX1 to CX2 task handoff.

## Development Rules

- Preserve the Human approval gate before CX2 dispatch.
- Do not add automatic shell, patch, or tool approval.
- Preserve full task logging under the configured Codex home log root.
- Keep public MCP tool names, task statuses, and result shapes compatible unless a breaking change is explicitly documented.
- Keep dependencies minimal. The controller currently uses only the Node.js standard library.

## Language

Use English for public project artifacts:

- commit messages
- pull request titles and descriptions
- issue titles and descriptions
- `CHANGELOG.md`
- release notes
- primary documentation such as `README.md`

Japanese translations may be added as separate files, such as `README.ja.md`.

## Branches and Commits

Maintain `main` as the publishable branch. Use short English topic branches for normal work:

- `docs/...` for documentation, roadmap, templates, and public repository maintenance.
- `chore/...` for release preparation, metadata, and non-runtime maintenance.
- `feat/...` for additive runtime behavior.
- `fix/...` for bug fixes.
- `test/...` for test-only changes.

Keep one branch scoped to one logical change. Use pull requests for compatibility changes, approval gate changes, approval request routing changes, full-log retention changes, runtime behavior changes, and release preparation.

Use English Conventional Commits:

```text
docs: add post-release maintenance templates
feat: add local marketplace setup check
test: cover approval request handling
fix: preserve retry status after tooling failure
chore: prepare v0.1.6 release
```

## Local Verification

Run from the repository root:

```sh
node --check mcp/cx2-controller/src/server.mjs
node mcp/cx2-controller/test/smoke.mjs
node mcp/cx2-controller/test/wait.mjs
node mcp/cx2-controller/test/model-settings.mjs
```

For JSON changes:

```sh
node -e 'for (const f of [".codex-plugin/plugin.json",".mcp.json","mcp/cx2-controller/config/defaults.json","mcp/cx2-controller/package.json","mcp/cx2-controller/schemas/task.schema.json","mcp/cx2-controller/schemas/result.schema.json","mcp/cx2-controller/schemas/approval.schema.json"]) JSON.parse(require("fs").readFileSync(f,"utf8")); console.log("json ok")'
```

## Pull Requests

Include:

- What changed.
- Why it is compatible with the approval and logging model.
- Verification commands and results.
- Any limitations or unverified runtime paths.
