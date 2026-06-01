# Operation

## Normal Use From CodexApp

1. Open the target implementation project in CodexApp.
2. Start a new chat.
3. Invoke the plugin or skill:

```text
@cx-orchestrator
```

or ask:

```text
Use the cx1-orchestrator skill and start as CX1 for this repository.
```

4. CX1 reads the target repo rules.
5. CX1 chooses the CX2 runtime for the task: model, reasoning effort, and speed.
6. CX1 prepares a CX2 prompt draft.
7. Human reviews the exact prompt.
8. CX1 starts CX2 only after Human approval.
9. CX1 waits for CX2 status changes with `cx2_wait_task` and handles approvals.
10. CX1 reviews CX2 output and reports the gate decision.

`cx2_poll_task` remains available for manual checks and debugging, but normal operation should use `cx2_wait_task` to reduce repeated CX1 tool calls and token usage.

Callback / push notification is not a `0.1.x` runtime assumption because CodexApp host-side automatic CX1 turn resumption is not guaranteed. Reconsider callback only if the host provides a confirmed wake/resume mechanism.

## Runtime Settings

CX2 does not automatically inherit CX1's current model, reasoning effort, or speed tier.

CX1 should decide the CX2 runtime before each task and show it in the approval text:

```text
CX2 Runtime: model=CodexCLI default / reasoning=medium / speed=standard
Reason: docs-only task
```

Default selection:

- `low`: tiny mechanical checks, status reads, simple formatting-only edits.
- `medium`: docs-only tasks, requirements organization, simple reviews, low-risk tests, small localized fixes.
- `high`: non-trivial implementation, architecture-sensitive changes, multi-file refactors, failing-test diagnosis, ambiguous technical decisions.
- `xhigh`: cross-cutting migrations, security/data-loss risk, complex state/concurrency bugs, or expensive-to-reverse design work.

CX1 passes the chosen `reasoning_effort` and `speed_tier` to both `cx2_prepare_task` and `cx2_start_task`. Human approval of the CX2 prompt also approves the displayed runtime.

## Model

CX1 does not set CX2 model by default. If Human explicitly requests a model, CX1 may pass `model` to `cx2_prepare_task` and `cx2_start_task`.

## Speed

Human-facing speed is `standard` or `fast`.

- `standard`: default. The controller omits CodexCLI `service_tier`.
- `fast`: only when Human explicitly requests Fast. The controller passes `config.service_tier = "fast"` to CodexCLI and warns that token usage may increase.

Fast is not reasoning depth. Do not convert Fast into `reasoning_effort: low`.

Existing running CX2 turns cannot change model, reasoning, or speed mid-execution; stop and start a new task when a different setting is required.

## Plugin Registration

Choose a local marketplace root. For example:

```text
/path/to/local/marketplace/root
```

Marketplace file:

```text
~/.agents/plugins/marketplace.json
```

Codex config must include:

```toml
[plugins."cx-orchestrator@local"]
enabled = true

[marketplaces.local]
source_type = "local"
source = "/path/to/local/marketplace/root"
```

After changing marketplace or plugin config, fully restart CodexApp and open a new chat.

The repository is designed to run from a local marketplace checkout. Do not place runtime task logs inside this repository; the default log root is under `~/.codex`.

To check the local setup without modifying Codex config or marketplace files, run from the plugin root:

```sh
node scripts/check-local-setup.mjs
```

The setup check reads the documented local marketplace shape and reports `PASS`, `WARN`, and `FAIL` lines. It exits with `0` when the required checks pass and `1` when setup problems are found.

## Runtime Logs

Default log root:

```text
~/.codex/cx-orchestrator/tasks
```

Task directory format:

```text
~/.codex/cx-orchestrator/tasks/<YYYYMMDD>/<task_id>/
```

Task id format:

```text
cx2-YYYYMMDD-HHMMSS-<shortid>
```

Saved files:

- `task.json`: task metadata, repo, limits, status
- `prompt.md`: Human-approved CX2 prompt
- `events.jsonl`: JSON-RPC events and controller events
- `stdout.log`: child process stdout raw log
- `stderr.log`: child process stderr raw log
- `approvals.jsonl`: approval request / response history
- `result.json`: normalized final result
- `final.md`: CX1-readable final summary

## Verification

Run from plugin root:

```sh
node --check mcp/cx2-controller/src/server.mjs
node mcp/cx2-controller/test/smoke.mjs
node mcp/cx2-controller/test/wait.mjs
node mcp/cx2-controller/test/model-settings.mjs
```

Validate JSON:

```sh
node -e 'for (const f of [".codex-plugin/plugin.json",".mcp.json","mcp/cx2-controller/config/defaults.json","mcp/cx2-controller/package.json","mcp/cx2-controller/schemas/task.schema.json","mcp/cx2-controller/schemas/result.schema.json","mcp/cx2-controller/schemas/approval.schema.json"]) JSON.parse(require("fs").readFileSync(f,"utf8")); console.log("json ok")'
```

Check whether Codex prompt loading sees the plugin:

```sh
/opt/homebrew/bin/codex debug prompt-input '@cx-orchestrator test'
```

The output should include the `CX Orchestrator` plugin and `cx-orchestrator:cx1-orchestrator` skill.

## Troubleshooting

### `@cx-orchestrator` Is Not Found

Run:

```sh
node scripts/check-local-setup.mjs
```

Check:

1. `~/.agents/plugins/marketplace.json` exists.
2. `~/.codex/config.toml` has `[marketplaces.local]`.
3. `~/.codex/config.toml` has `[plugins."cx-orchestrator@local"]`.
4. CodexApp was fully restarted after config changes.
5. A new chat was opened after restart.

### CX2 Does Not Start

Check:

1. `/opt/homebrew/bin/codex` exists.
2. `/opt/homebrew/bin/codex --version` works.
3. `mcp/cx2-controller/config/defaults.json` still points to `/opt/homebrew/bin/codex`.
4. `limits.max_runtime_minutes` and `limits.max_retries` were provided.
5. The repo path passed to CX2 is absolute and exists.

### Logs Are Missing

Check:

1. `defaultLogRoot` in `mcp/cx2-controller/config/defaults.json`.
2. Whether the controller process had permission to write under `~/.codex`.
3. `stderr.log` for controller or CodexCLI startup errors.
