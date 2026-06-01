# Changelog

## Unreleased

Public repository readiness updates.

### Added

- Local marketplace setup check script and fixture tests.
- CI status badge in README files.
- GitHub issue templates for bug reports, feature requests, and maintainer tasks.
- Pull request template for compatibility, safety, and validation review.
- Post-release roadmap draft for `0.1.6+` issue planning.
- Maintainer branch and commit policy for public OSS work.
- MIT license.
- Contributing guide.
- Security policy.
- `.gitignore` for local runtime artifacts and editor/package-manager noise.
- Public GitHub repository metadata for `ymt23/cx-orchestrator`.
- Public disclaimer, requirements, known limitations, and roadmap ideas in README.

### Changed

- Plugin and controller metadata now declare MIT licensing.
- Plugin and controller author metadata now identify `ymt23`.
- Public docs now use generic local paths instead of maintainer-specific absolute paths.
- Maintainer-facing policy and skill docs no longer hard-code a personal local checkout path.
- `AGENTS.md` is now English-first for OSS publication.

## 0.1.5

Adds per-task CX2 runtime display and speed tier control.

### Added

- `cx2_prepare_task` and `cx2_start_task` accept `speed_tier: "standard" | "fast"`.
- Resolved `runtime_settings` are saved to `task.json` and returned from prepare, start, poll, wait, and result paths.
- `model_settings` remains as a compatibility alias.
- Fast speed maps to CodexCLI `config.service_tier = "fast"` while standard speed omits `service_tier`.
- Human approval text now includes `CX2 Model`, `CX2 Reasoning`, and `CX2 Speed`.

### Changed

- CX1 policy now shows full CX2 runtime before dispatch.
- CX1 still selects reasoning per task, but must not select Fast unless Human explicitly requests it.
- Running CX2 tasks cannot change model, reasoning, or speed; start a new task for runtime changes.

## 0.1.4

Adds CX1 skill guidance for per-task CX2 reasoning effort selection.

### Changed

- CX1 now selects `reasoning_effort` before each CX2 task.
- Docs-only and simple review tasks default to `medium`.
- Non-trivial implementation, refactor, failing-test diagnosis, or architecture-sensitive tasks default to `high`.
- `xhigh` is reserved for cross-cutting, high-risk, or expensive-to-reverse tasks.
- Standard CX1 skill no longer asks for model by default; model is passed only when Human explicitly requests it.

## 0.1.3

Adds CX1 skill guidance for a chat-local CX2 Runtime Profile.

### Changed

- CX1 now establishes model/reasoning policy once before the first CX2 task.
- CX1 reuses the CX2 Runtime Profile for later `cx2_prepare_task` and `cx2_start_task` calls.
- Plugin default prompt now asks CX1 to establish and reuse the runtime profile.

### Notes

- This does not add automatic CX1 model detection. CX1 must still declare known settings, ask Human once, or disclose CodexCLI defaults.

## 0.1.2

Adds explicit CX2 model and reasoning policy.

### Added

- `cx2_prepare_task` now accepts `model`, `reasoning_effort`, `match_cx1_settings`, `cx1_model`, and `cx1_reasoning_effort`.
- `cx2_start_task` records resolved model settings in `task.json` and passes them to CodexCLI at task start.
- Human approval text now includes CX2 model settings.
- Controller defaults now include optional `defaultModel` and `defaultReasoningEffort`.
- Model settings test for explicit and CX1-matched settings.

### Notes

- The controller cannot auto-detect the current CX1 model or reasoning effort from CodexApp.
- `match_cx1_settings` requires CX1/Human to provide explicit CX1 model and reasoning values.
- A running CX2 turn cannot change model or reasoning mid-execution with the current CodexCLI `codex-reply` schema. Stop and restart as a new task when a different model is needed.

## 0.1.1

Adds long-wait task monitoring to reduce repeated CX1 polling.

### Added

- `cx2_wait_task` MCP tool.
- Default wait statuses for completed, approval, blocked, failed, and stopped states.
- 300 second default and maximum wait timeout.
- Controller behavior tests for missing task, completed task, timeout, and pending approval wait paths.

### Changed

- CX1 policy now prefers `cx2_wait_task` after `cx2_start_task`.
- `cx2_poll_task` remains available for manual checks and debugging.

### Notes

- Callback / push notification is not adopted in `0.1.1` because CodexApp host-side automatic CX1 turn resumption is not guaranteed.

## 0.1.0

Initial working release.

### Added

- Home-local Codex plugin structure.
- CX1 orchestration skill.
- `cx2_controller` MCP server.
- Controlled CX2 execution through `/opt/homebrew/bin/codex mcp-server`.
- Human approval gate before CX2 dispatch.
- Generic approval forwarding path for CX2 approval requests.
- Full task logging under `~/.codex/cx-orchestrator/tasks/`.
- Task status model:
  - `draft_prompt`
  - `approved_to_send`
  - `running`
  - `pending_cx1_approval`
  - `completed`
  - `blocked_needs_cx1`
  - `blocked_needs_human`
  - `failed_tooling`
  - `stopped_by_cx1`
- Controller smoke test.

### Notes

- `app-server` is intentionally not used in `0.1.0`.
- `max_retries` is accepted and stored, but no retry loop is implemented yet.
- Live approval resume behavior is implemented generically but should be verified against real CodexCLI approval-producing tasks before expanding automation.
