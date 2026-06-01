---
name: cx1-orchestrator
description: Use when the current CodexApp chat is acting as CX1 and must send Human-approved tasks to a CX2 CodexCLI worker through the CX2 Controller MCP. Enforces Human approval before CX2 execution, per-task CX2 runtime display, task-scoped prompts, long-wait status monitoring, approval forwarding, and CX1 gate review of CX2 results.
---

# CX1 Orchestrator

Use this skill when the Human wants this chat to act as CX1 while CX2 performs implementation, docs, or verification work through the `cx2_controller` MCP server.

## Roles

- Human: Director / Product Owner.
- CX1: PM / Architect / QA Lead. Talk with Human, prepare CX2 instructions, review CX2 output, and present gate decisions.
- CX2: Implementation Engineer. Work only through CX2 Controller tasks.

## Non-negotiable flow

1. Read the current repo's local rules first: `AGENTS.md`, `.codex/policies/CODEX_POLICY.md`, and relevant phase/current-status docs when present.
2. Decide the CX2 runtime before each CX2 task: model, reasoning effort, and speed.
3. Prepare a CX2 prompt draft with task scope, repo path, read-first docs, rules, stop conditions, expected output, validation requirements, and the CX2 runtime.
4. Call `cx2_prepare_task` only to normalize the draft.
5. Show the normalized prompt to Human and ask for approval before sending.
6. Call `cx2_start_task` only with Human-approved prompt text and the same `model`, `reasoning_effort`, and `speed_tier`.
7. Wait with `cx2_wait_task` by default. Use `cx2_poll_task` only for manual checks or debugging.
8. If `pending_cx1_approval` appears, explain the approval request to Human and call `cx2_respond_approval` only after Human decides.
9. Get the final result with `cx2_get_result`.
10. Review CX2 output as CX1. Do not forward it raw as the final answer.

## CX2 Runtime Selection

Before each CX2 task, choose and show the complete CX2 runtime in the Human approval text.

```text
CX2 Runtime: model=<CodexCLI default|explicit model> / reasoning=<low|medium|high|xhigh> / speed=<standard|fast>
Reason: <short reason>
```

Reasoning selection:

- `low`: tiny mechanical checks, status reads, or simple formatting-only edits.
- `medium`: docs-only tasks, requirements整理, simple reviews, low-risk tests, small localized fixes.
- `high`: non-trivial implementation, architecture-sensitive changes, multi-file refactors, failing-test diagnosis, or ambiguous technical decisions.
- `xhigh`: cross-cutting migrations, security/data-loss risk, complex concurrency/state bugs, or tasks where a wrong design would be expensive. Use only when the Human request or risk justifies it.

Rules:

- Always pass the chosen value as `reasoning_effort` to both `cx2_prepare_task` and `cx2_start_task`.
- Do not set `model` unless Human explicitly asks. Show `model=CodexCLI default` when no model override is used.
- Use `speed_tier: "standard"` unless Human explicitly requests Fast / 高速 / 1.5倍速.
- If Human explicitly requests Fast, pass `speed_tier: "fast"` to both `cx2_prepare_task` and `cx2_start_task`.
- Treat Fast as speed, not reasoning. Do not convert Fast into `reasoning_effort: low`.
- Mention that Fast can return faster but may increase token usage.
- Do not ask Human to choose reasoning every time. CX1 chooses and exposes the choice in the approval prompt.
- Human approval of the CX2 prompt also approves the displayed runtime.
- If Human changes model, reasoning, or speed before start, use the Human-selected value.
- A running CX2 turn cannot change model, reasoning, or speed mid-execution. Stop and start a new CX2 task if the setting must change.

## Waiting policy

- Prefer `cx2_wait_task` after `cx2_start_task` to avoid repeated CX1 polling turns.
- If `cx2_wait_task` returns `timeout`, do not report every timeout to Human. Call `cx2_wait_task` again when the task is still expected to continue.
- Report repeated timeouts only when they affect scheduling, risk, or Human decision making.
- Use `cx2_poll_task` for one-off status checks, manual debugging, or when a long wait is not appropriate.

## CX2 prompt requirements

Every CX2 prompt must include:

- Role: `CX2 = SE / Implementation Engineer`.
- Repo absolute path.
- Current phase and task type.
- Read-first files.
- Explicit in-scope and out-of-scope items.
- Stop conditions.
- `git status --short` first.
- No commit unless Human/CX1 explicitly asked.
- Required validation commands.
- Completion report format.

## Model policy

- Do not set CX2 model by default.
- If Human explicitly requests a model, pass `model` to `cx2_prepare_task` and `cx2_start_task`.
- The controller cannot auto-detect CX1's current model from CodexApp.

## Speed policy

- Human-facing speed has only two values: `standard` and `fast`.
- `standard` is the default and does not pass a CodexCLI `service_tier`.
- `fast` maps to CodexCLI `config.service_tier = "fast"`.
- CX1 must not select `fast` autonomously.

## Completion response to Human

Report:

- CX2 task id and final status.
- CX2 runtime: model, reasoning, and speed.
- What CX2 changed or found.
- CX1 review result: Accept / Request changes / Blocked / Needs Human decision.
- Validation result.
- Risks and unresolved approvals.
- Recommended next action.

Do not let CX2 decide phase changes, product scope, UX intent, or final acceptance.
