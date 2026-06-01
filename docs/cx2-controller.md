# CX2 Controller

## Location

```text
mcp/cx2-controller/src/server.mjs
```

## Public MCP Tools

- `cx2_prepare_task`
- `cx2_start_task`
- `cx2_poll_task`
- `cx2_wait_task`
- `cx2_respond_approval`
- `cx2_stop_task`
- `cx2_get_result`
- `cx2_list_tasks`
- `cx2_read_task_log`

## Task Statuses

- `draft_prompt`: prompt normalized for Human review
- `approved_to_send`: Human-approved prompt accepted by controller
- `running`: CX2 child task is running
- `pending_cx1_approval`: CX2 is waiting for approval
- `completed`: CX2 completed
- `blocked_needs_cx1`: CX2 needs CX1 instruction
- `blocked_needs_human`: CX2 needs Human decision
- `failed_tooling`: controller or CodexCLI tooling failed
- `stopped_by_cx1`: CX1 stopped the task

## Wait Tool

`cx2_wait_task` is the normal monitoring tool after `cx2_start_task`.

Default `wait_for` statuses:

- `completed`
- `pending_cx1_approval`
- `blocked_needs_cx1`
- `blocked_needs_human`
- `failed_tooling`
- `stopped_by_cx1`

Default and maximum `timeout_seconds` is `300`.

The tool returns a minimal payload with current status, `wait_result`, pending approval if any, latest event summary, log directory, and next action. A `timeout` result does not change the stored task status.

## Config

Default config file:

```text
mcp/cx2-controller/config/defaults.json
```

Current defaults:

```json
{
  "pluginVersion": "0.1.5",
  "allowedCodexBinary": "/opt/homebrew/bin/codex",
  "defaultLogRoot": "~/.codex/cx-orchestrator/tasks",
  "defaultSandbox": "workspace-write",
  "defaultModel": null,
  "defaultReasoningEffort": null,
  "approvalPolicy": "on-request",
  "commitPolicy": "deny-unless-explicit",
  "appServer": false
}
```

## Runtime Settings

`cx2_prepare_task` and `cx2_start_task` accept:

- `model`
- `reasoning_effort`
- `speed_tier`
- `match_cx1_settings`
- `cx1_model`
- `cx1_reasoning_effort`

When `match_cx1_settings` is true, explicit model and reasoning values are required. The controller cannot inspect CodexApp's current CX1 model automatically.

The resolved settings are stored in `task.json` under `runtime_settings`. `model_settings` remains as a compatibility alias. The resolved settings are returned from `cx2_prepare_task`, `cx2_start_task`, `cx2_poll_task`, `cx2_wait_task`, and `cx2_get_result`.

`speed_tier` is the public Human-facing value:

- `standard`: default. The controller stores `service_tier: null` and omits CodexCLI `service_tier`.
- `fast`: maps to CodexCLI `config.service_tier = "fast"`. Use only when Human explicitly requests Fast / 高速 / 1.5倍速 because token usage may increase.

The current CodexCLI `codex-reply` schema does not accept model, reasoning, or speed overrides, so running CX2 turns cannot change runtime settings mid-execution.

The standard CX1 skill does not set `model` by default. It selects `reasoning_effort` per task and uses `speed_tier: "standard"` unless Human explicitly requests Fast.

## Logging Contract

The controller must preserve enough information to audit CX2 behavior after the fact.

Required files:

- `task.json`
- `prompt.md`
- `events.jsonl`
- `stdout.log`
- `stderr.log`
- `approvals.jsonl`
- `result.json`
- `final.md`

Do not remove or weaken full-log retention without explicit Human approval.

## Adapter Notes

The controller starts:

```text
/opt/homebrew/bin/codex mcp-server
```

The observed CodexCLI MCP interface exposes:

- `codex`
- `codex-reply`

The controller's public tools are intentionally stable even if the internal CodexCLI adapter changes.

## Required Limits

`cx2_prepare_task` and `cx2_start_task` require:

- `limits.max_runtime_minutes`
- `limits.max_retries`

`max_runtime_minutes` is enforced by timeout.

`max_retries` is currently stored and validated, but a retry loop is not implemented in `0.1.0`.

## Validation

Run:

```sh
node --check mcp/cx2-controller/src/server.mjs
node mcp/cx2-controller/test/smoke.mjs
node mcp/cx2-controller/test/wait.mjs
node mcp/cx2-controller/test/model-settings.mjs
```

For JSON changes, validate all edited JSON files with `JSON.parse`.

## Compatibility Rules

- Keep public tool names stable within `0.1.x` unless there is a documented breaking change.
- Prefer additive schema changes.
- Keep task status names stable.
- Preserve log file names.
- Keep Human approval gate mandatory.
- Keep default `appServer` false until a later design explicitly adopts app-server.
- Do not replace `cx2_wait_task` with callback behavior unless CodexApp host-side turn resumption is confirmed.
