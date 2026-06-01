# Roadmap

This roadmap records candidate work after the initial `0.1.5` public release.
It is not a release commitment. Track accepted work in GitHub Issues before implementation.

## 0.1.6 Candidate Backlog

### Add setup check for local marketplace configuration

Problem:

- Installation currently relies on users correctly wiring the local Codex plugin marketplace and enabling `cx-orchestrator@local`.
- A broken marketplace path or disabled plugin can be hard to diagnose from CodexApp alone.

Scope:

- Add a local setup check command or documented diagnostic script.
- Check the local marketplace entry, plugin manifest readability, and expected config shape.
- Report actionable errors without modifying global Codex config automatically.

Acceptance:

- The check can confirm a healthy local marketplace setup.
- The check reports missing plugin enablement, missing manifest, and invalid JSON distinctly.
- Documentation explains that the check is diagnostic and does not bypass Human approval gates.

### Add tests for approval request handling

Problem:

- The controller has a generic approval forwarding path, but coverage around approval request state transitions should be stronger before expanding automation.

Scope:

- Add focused tests for tasks that enter `pending_cx1_approval`.
- Cover approval request recording, polling, waiting, and resume/error behavior.
- Use synthetic controller fixtures where real CodexCLI approval-producing tasks are not stable enough for CI.

Acceptance:

- Tests verify that approval requests remain routed to CX1/Human.
- Tests verify that automatic approval is not introduced.
- The CI workflow runs the new approval tests.

### Implement documented retry loop for max_retries

Problem:

- `max_retries` is validated and stored, but no retry loop is implemented yet.

Scope:

- Define retryable vs non-retryable failure classes.
- Implement retries only for documented retryable tooling failures.
- Persist each retry attempt in task logs and `task.json`.

Acceptance:

- `max_retries` behavior is documented in `docs/cx2-controller.md`.
- Retry attempts preserve full logs.
- Non-retryable approval, Human-blocked, and stopped states are not retried.

### Add sanitized log export for issue reports

Problem:

- Full task logs can contain prompts, command output, paths, and repository context that should not be pasted into public issues.

Scope:

- Add a tool or script that exports a redacted issue-report bundle from a task directory.
- Preserve enough metadata for debugging: task id, status, runtime settings, timestamps, and error class.
- Redact prompt text, command output, sensitive paths, and obvious secret patterns by default.

Acceptance:

- Export output is safe to inspect before sharing.
- Documentation warns that maintainers must review exports before attaching them publicly.
- Full original logs remain unchanged under the configured log root.

### Add task list filtering and summary inspection

Problem:

- Maintainers need quick task inspection without reading full task logs.

Scope:

- Add filtering by status, created/updated time, and target repository path when available.
- Add a summary view for runtime settings, status, approval state, and result metadata.
- Keep full log reading as an explicit action.

Acceptance:

- The summary view does not expose full prompts or command output by default.
- Filtering works across existing task directories.
- Existing task file shapes remain compatible.

### Support configurable CodexCLI binary path with compatibility checks

Problem:

- The default CodexCLI binary path is fixed to `/opt/homebrew/bin/codex`.
- Some maintainers may need a different path, but changing this can break compatibility and safety assumptions.

Scope:

- Keep `/opt/homebrew/bin/codex` as the default allowed binary.
- Add explicit configuration for alternate binary paths.
- Validate the configured binary before use with version and MCP capability checks.

Acceptance:

- Default behavior remains unchanged.
- Alternate paths fail closed when the binary is missing or incompatible.
- Documentation explains compatibility risks before users change the path.
