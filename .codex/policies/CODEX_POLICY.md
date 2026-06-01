# CODEX_POLICY.md

## Scope

This policy applies when Codex works inside the `cx-orchestrator` repository.

## Read Order

Before changes:

1. `AGENTS.md`
2. `README.md`
3. `docs/INDEX.md`
4. this file

For implementation or maintenance, also use:

```text
.codex/skills/cx-orchestrator-maintainer/SKILL.md
```

## Change Policy

- Keep changes minimal and project-scoped.
- Do not change runtime behavior while only updating docs.
- Do not update marketplace or global Codex config unless the user explicitly asks.
- Do not weaken approval gates.
- Do not add automatic approval.
- Do not add external dependencies without explicit approval.
- Do not replace `/opt/homebrew/bin/codex` with PATH lookup without explicit approval.
- Do not introduce `app-server` into the runtime path without a design update.
- Preserve full logging.

## Language Policy

- Use English for public OSS artifacts by default: `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, release notes, GitHub issues, pull requests, and public commit messages.
- Use Japanese for Human-facing Codex responses in this repository unless Human explicitly requests another language.
- Maintain Japanese translations as separate files when useful, for example `README.ja.md`.
- Translate Human's Japanese intent into clear English public documentation without changing the approved scope or meaning.

## Branch and Commit Policy

- Treat `main` as the always-publishable branch.
- Do not commit directly to `main` for normal maintenance work.
- Before committing, use a short English topic branch unless the Human explicitly instructs otherwise.
- Branch prefixes:
  - `docs/`: documentation, roadmap, templates, and public repository maintenance.
  - `chore/`: release preparation, metadata, and non-runtime maintenance.
  - `feat/`: additive runtime behavior.
  - `fix/`: bug fixes.
  - `test/`: test-only changes.
- Keep each branch scoped to one logical change.
- Use pull requests for compatibility changes, approval gate changes, approval request routing changes, full-log retention changes, runtime behavior changes, and release preparation.
- Do not create commits unless the Human explicitly asks.
- For this public OSS repository, commit messages must be English Conventional Commits.
- Example commit messages:
  - `docs: add post-release maintenance templates`
  - `feat: add local marketplace setup check`
  - `test: cover approval request handling`
  - `fix: preserve retry status after tooling failure`
  - `chore: prepare v0.1.6 release`

## Compatibility

The public MCP interface is the compatibility boundary:

- tool names
- input fields
- task status names
- log file names
- result shape

Prefer additive changes. For breaking changes, update:

- `README.md`
- `CHANGELOG.md`
- `docs/cx2-controller.md`
- `skills/cx1-orchestrator/SKILL.md`
- `.codex/skills/cx-orchestrator-maintainer/SKILL.md` if workflow changes

## Validation Expectations

Minimum:

```sh
node --check mcp/cx2-controller/src/server.mjs
node mcp/cx2-controller/test/smoke.mjs
node mcp/cx2-controller/test/wait.mjs
node mcp/cx2-controller/test/model-settings.mjs
```

When plugin metadata or config changes, validate JSON.

When controller behavior changes, perform an MCP initialize/tools smoke test. If feasible, run a real dry CX2 task and confirm a task directory is created under `~/.codex/cx-orchestrator/tasks/`.

## Reporting

Final responses should include:

- changed files
- behavior changes
- validation results
- remaining risks or unverified paths

Keep reports concise.
