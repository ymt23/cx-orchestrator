# Roadmap

This roadmap records post-release work for CX Orchestrator. It is not a release commitment. Accepted work should be tracked in GitHub Issues, and this document should stay aligned with those issues.

The current direction is defined by [codexapp-differentiation.md](codexapp-differentiation.md): CX Orchestrator is not a replacement for CodexApp thread management. It should continue only as a Human-approved delegation, governance, and audit layer above CodexApp and CodexCLI.

## Current GitHub Issue Sync

Issue state was checked on 2026-06-02 through the GitHub MCP issue search tool.

| Issue | State | Roadmap bucket | Notes |
| --- | --- | --- | --- |
| [#2 Add setup check for local marketplace configuration](https://github.com/ymt23/cx-orchestrator/issues/2) | Closed | Completed | Implemented as setup diagnostics and tests. Keep docs current, but do not treat this as open backlog. |
| [#3 Add tests for approval request handling](https://github.com/ymt23/cx-orchestrator/issues/3) | Open | Governance / audit priority | Protects the approval-forwarding contract and prevents accidental automatic approval. |
| [#4 Implement documented retry loop for max_retries](https://github.com/ymt23/cx-orchestrator/issues/4) | Open | Careful runtime change | Useful only if retries preserve log retention and never retry approval, Human-blocked, or stopped states. |
| [#5 Add sanitized log export for issue reports](https://github.com/ymt23/cx-orchestrator/issues/5) | Open | Governance / audit priority | Makes the full-log audit contract practical for support without weakening original log retention. |
| [#6 Add task list filtering and summary inspection](https://github.com/ymt23/cx-orchestrator/issues/6) | Open | Governance / audit priority | Improves task triage while keeping full prompt and command output access explicit. |
| [#7 Support configurable CodexCLI binary path with compatibility checks](https://github.com/ymt23/cx-orchestrator/issues/7) | Open | Careful runtime change | Must keep `/opt/homebrew/bin/codex` as the default and fail closed for incompatible binaries. |

## Roadmap Buckets

### Governance / Audit Priority

These items directly support the plugin's differentiator: supervised, Human-approved CX2 delegation with durable auditability.

1. [#3 Add tests for approval request handling](https://github.com/ymt23/cx-orchestrator/issues/3)
   - Verify transitions into `pending_cx1_approval`.
   - Verify approval requests remain routed to CX1/Human.
   - Verify automatic approval is not introduced.
   - Prefer synthetic fixtures when real approval-producing CodexCLI tasks are not CI-stable.

2. [#5 Add sanitized log export for issue reports](https://github.com/ymt23/cx-orchestrator/issues/5)
   - Export a redacted issue-report bundle from a task directory.
   - Preserve enough metadata for debugging: task id, status, runtime settings, timestamps, and error class.
   - Redact prompt text, command output, sensitive paths, and obvious secret patterns by default.
   - Never replace or weaken full original logs under the configured log root.

3. [#6 Add task list filtering and summary inspection](https://github.com/ymt23/cx-orchestrator/issues/6)
   - Add filtering by status, created/updated time, and target repository path when available.
   - Add a low-risk summary view for runtime settings, status, approval state, and result metadata.
   - Keep full log reading as an explicit action.
   - Preserve existing task file shapes.

### Careful Runtime Changes

These items can improve operations, but they touch runtime behavior or compatibility assumptions. Implement them only with focused tests and documentation updates.

1. [#4 Implement documented retry loop for max_retries](https://github.com/ymt23/cx-orchestrator/issues/4)
   - Define retryable and non-retryable failure classes before implementation.
   - Retry only documented retryable tooling failures.
   - Persist every retry attempt in task logs and `task.json`.
   - Do not retry approval requests, Human-blocked states, CX1-blocked states, or stopped tasks.

2. [#7 Support configurable CodexCLI binary path with compatibility checks](https://github.com/ymt23/cx-orchestrator/issues/7)
   - Keep `/opt/homebrew/bin/codex` as the default allowed binary.
   - Add explicit configuration for alternate binary paths.
   - Validate configured binaries with version and MCP capability checks before use.
   - Fail closed when the binary is missing or incompatible.
   - Do not replace the default with PATH lookup.

### Completed

1. [#2 Add setup check for local marketplace configuration](https://github.com/ymt23/cx-orchestrator/issues/2)
   - The repository now has `scripts/check-local-setup.mjs`.
   - The setup check is covered by `scripts/test-check-local-setup.mjs`.
   - README, operation docs, and CI reference the diagnostic path.
   - Future work should keep the check diagnostic-only and avoid writing global Codex config automatically.

## Do Not Expand Without Separate Design

These areas overlap with CodexApp standard capabilities or the App Server lifecycle. Do not add them as ordinary roadmap items without a separate design artifact and explicit approval.

- Generic thread creation.
- Existing CodexApp thread continuation.
- Pin/archive/rename thread management.
- Generic parallel work orchestration.
- Worktree creation, handoff, cleanup, or branch management.
- Thread heartbeat scheduling.
- Standalone/project recurring automation scheduling.
- Callback or push-based CX1 wake/resume.
- App Server lifecycle replacement for the current controller runtime path.

## App Server Position

Codex App Server documents thread and turn lifecycle APIs such as `thread/start`, `thread/resume`, `thread/fork`, `turn/start`, and streamed notifications. Those APIs may become the right substrate for a future redesign.

For `0.1.x`, App Server remains outside the runtime path. Any App Server integration must first explain how it preserves these core invariants:

- Human approval of exact prompt text before CX2 dispatch.
- Task-scoped runtime display and freeze.
- CX2 approval forwarding to CX1/Human.
- Durable task audit logs.
- Commit denial unless explicitly requested.
- CX1 gate review before Human-facing report.

## Stop Or Shrink Conditions

CX Orchestrator can stop, or shrink to a thin skill/policy layer, if CodexApp or App Server standardizes all of the following as supported contracts:

- Exact prompt approval before dispatch.
- Task-scoped runtime display and freeze.
- Approval forwarding to a supervising thread.
- Durable audit log export with prompt, events, approvals, stdout/stderr, result, and final summary equivalents.
- Supervisor-side gate review before the Human-facing final report.

Partial availability is not enough to remove the governance layer. App Server thread lifecycle plus streamed events can replace low-level task control, but not the supervisor contract by itself.
