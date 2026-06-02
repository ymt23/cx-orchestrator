# CodexApp Differentiation

## Executive Summary

CodexApp now covers much of the generic orchestration surface that CX Orchestrator originally had to work around: background threads, existing-thread continuation, parallel work, worktree isolation, thread and standalone automations, and programmatic thread lifecycle control through Codex App Server.

That means CX Orchestrator should not be positioned as a replacement for CodexApp thread management. Its defensible role is narrower: a Human-approved delegation, governance, and audit layer on top of CodexApp and CodexCLI. The current evidence supports continuing it only where it preserves explicit supervisor behavior that the standard Codex surfaces do not document as a built-in contract.

## Verified Sources

This document was prepared against the Codex manual fetched on 2026-06-02, plus the current repository documentation and current-session CodexApp tool surface.

Investigation snapshot:

- Date: 2026-06-02
- CodexApp: 26.527.60818, build 3437
- CodexCLI: 0.130.0 from `/opt/homebrew/bin/codex --version`
- Codex manual: fetched and reported current on 2026-06-02
- GitHub Issues: checked through GitHub MCP issue search for roadmap alignment

Official Codex manual sections checked:

- Codex app features: parallel threads, background threads, worktree support, automations, approvals, and sandboxing.
- Automations: thread automations, standalone/project automations, worktree execution, and unattended approval behavior.
- Worktrees: Codex-managed worktrees, handoff, branch behavior, cleanup, and automation worktree behavior.
- Codex App Server: JSON-RPC protocol, `thread/start`, `thread/resume`, `thread/fork`, `turn/start`, `turn/steer`, notifications, and streamed lifecycle events.
- Agent approvals and security: sandbox and approval boundaries, user approvals, auto-review, and unattended automation behavior.

Repository sources checked:

- `README.md`
- `docs/architecture.md`
- `docs/cx2-controller.md`
- `docs/roadmap.md`
- `skills/cx1-orchestrator/SKILL.md`
- `.codex/policies/CODEX_POLICY.md`

Current-session CodexApp tool surface also exposes thread creation, listing, reading, continuation, pin/archive/title updates, and automation create/update/view/delete. This confirms that thread management and automations are available in the active environment, not only in static documentation.

## Comparison Table

| Capability | CodexApp standard surface | CX Orchestrator | Differentiation result |
| --- | --- | --- | --- |
| Create a new thread | Supported through the app and current-session `create_thread`; App Server documents `thread/start`. | Can start a CX2 task through `cx2_start_task`, but this is not generic thread creation. | Replace with CodexApp for generic thread creation. |
| Continue an existing thread | Supported through app thread management, current-session `send_message_to_thread`, and App Server `thread/resume`. | CX2 tasks are tracked by controller task ids and logs, not by resuming a standard CodexApp thread. | Replace with CodexApp for generic continuation. |
| Find/read thread history | Supported through app thread management and current-session `list_threads` / `read_thread`. | Controller can list/read CX2 task logs, not CodexApp thread history. | Replace for thread history; keep task audit logs. |
| Pin/archive/rename | Supported in current-session tool surface. | Not a CX Orchestrator concern. | Stop or avoid implementing. |
| Parallel work | CodexApp is designed for parallel threads across projects. | CX Orchestrator delegates a scoped task from CX1 to CX2. | Replace for generic parallelism; keep for supervised delegation. |
| Worktree isolation | CodexApp supports Local and Worktree modes, Codex-managed worktrees, and automation worktrees. | Controller runs the selected task in the target repo path and does not manage CodexApp worktrees. | Replace worktree management with CodexApp. |
| Thread automation / heartbeat | CodexApp supports heartbeat-style thread automations attached to a conversation. | `cx2_wait_task` supports long waits, but callback/push CX1 wake is intentionally not assumed. | Replace heartbeat/wake scheduling with CodexApp. |
| Standalone/project automation | CodexApp supports recurring standalone/project automations, including worktree execution. | CX Orchestrator is not a scheduler. | Replace with CodexApp automations. |
| Programmatic control | App Server documents JSON-RPC lifecycle APIs for threads and turns, with streamed events. | Controller exposes MCP tools that normalize prompts, status, approvals, logs, and results for CX1 delegation. | App Server replaces low-level lifecycle primitives; CX Orchestrator may wrap governance-specific behavior if redesigned. |
| Human-approved exact prompt before dispatch | Not documented as a built-in standard thread lifecycle requirement. A user can review a prompt manually, but the standard surface is not framed as an exact-prompt approval contract before dispatch. | Required: CX1 shows the normalized prompt and starts CX2 only after Human approval. | Keep. This is a core differentiator. |
| Task-scoped runtime display/freeze | CodexApp and automations allow model/reasoning choices; App Server `turn/start` can override model and other settings. The manual does not describe a supervisor approval contract that freezes runtime with the prompt. | Required: CX1 displays model, reasoning, and speed before each task; Human approval covers the prompt and runtime; running tasks cannot change these settings. | Keep. |
| Approval forwarding to supervisor | Standard Codex approvals route to the user or auto-reviewer according to approval policy. | Required: CX2 approval requests enter `pending_cx1_approval` and must be routed back through CX1/Human. | Keep. |
| State classification | Standard lifecycle has thread, turn, item, and completion events; current docs do not define CX1-specific states such as `blocked_needs_human`. | Controller defines `draft_prompt`, `pending_cx1_approval`, `blocked_needs_cx1`, `blocked_needs_human`, `failed_tooling`, and related statuses. | Keep. |
| Durable full task audit | Codex surfaces stream events and may expose logs, but this repo's full task log contract is explicit and local. | Required files are stored under `~/.codex/cx-orchestrator/tasks/`: `task.json`, `prompt.md`, `events.jsonl`, `stdout.log`, `stderr.log`, `approvals.jsonl`, `result.json`, and `final.md`. | Keep unless CodexApp/App Server offers equivalent durable export. |
| Commit denial unless explicit | Codex standard approvals and sandboxing constrain actions, and CodexApp has Git tools. The repo's policy is stricter for CX2 delegation. | Controller and policy deny commits unless Human/CX1 explicitly asked. | Keep as governance policy. |
| CX1 gate review before Human report | Standard background threads can report results directly. | Required: CX1 reviews CX2 output and does not raw-forward the result as the final answer. | Keep. |

## Differentiation Thesis

The strongest current thesis is:

> CX Orchestrator is not a CodexApp thread-management replacement. It is a Human-approved delegation, governance, and audit layer above CodexApp and CodexCLI.

This thesis is supported by the current Codex manual and the repository's own invariants. CodexApp is already the better home for generic thread lifecycle, background execution, worktree isolation, automations, Git operations, and host-side UI management. CX Orchestrator remains valuable only where it enforces a stricter delegation contract:

- CX1 is the Human-facing PM / Architect / QA Lead.
- CX2 receives only an exact prompt that the Human approved in advance.
- CX2 runtime settings are shown and fixed per task.
- CX2 approval requests return to CX1/Human.
- CX2 task state is classified for supervision, not only completion.
- Full task logs are preserved as an audit contract.
- Commits are denied unless explicitly requested.
- CX1 gate-reviews CX2 output before reporting to Human.

No current source checked for this document proves that CodexApp or App Server already provides this complete supervisor-side contract as a standard feature. The counterpoint is that App Server is the likely future substrate for low-level thread lifecycle. If CX Orchestrator continues, it should reduce duplicated lifecycle logic and focus on the governance layer.

## Overlap / Replace / Keep / Stop

| Classification | Area | Reason |
| --- | --- | --- |
| Replace with CodexApp | Generic thread creation | CodexApp and App Server already provide this. |
| Replace with CodexApp | Existing thread continuation | CodexApp and App Server already provide this. |
| Replace with CodexApp | Parallel background work | CodexApp is explicitly designed for threads in parallel. |
| Replace with CodexApp | Worktree isolation | CodexApp owns Local/Worktree modes and worktree handoff. |
| Replace with CodexApp | Thread heartbeat / wake scheduling | Thread automations are the standard heartbeat mechanism. |
| Replace with CodexApp | Standalone/project recurring jobs | Standalone/project automations are the standard recurring-job mechanism. |
| Replace or integrate | Low-level thread lifecycle APIs | App Server documents the standard thread/turn lifecycle. |
| Keep | Exact prompt approval before dispatch | This is the core CX1/Human gate. |
| Keep | Task-scoped runtime display and freeze | This makes the approved delegation reproducible. |
| Keep | Approval forwarding back to CX1/Human | This preserves the Human-facing supervisor boundary. |
| Keep | Supervisor-specific task statuses | These states support CX1 gate decisions and retry/block triage. |
| Keep | Full task log audit contract | This is stronger and more explicit than generic streamed events. |
| Keep | Commit deny unless explicit | This is a governance invariant, not a thread primitive. |
| Keep | CX1 gate review of CX2 results | This prevents raw worker output from becoming the Human-facing decision. |
| Stop or avoid | Pin/archive/rename management | CodexApp already owns thread organization. |
| Stop or avoid | Callback/push wake implementation | CodexApp thread automations should own host-side wake behavior unless a later design proves a gap. |
| Shrink | App Server-equivalent lifecycle glue | If adopted, App Server should be the substrate, not duplicated. |

## Roadmap Impact

The roadmap should stay focused on governance, diagnostics, and audit quality rather than generic orchestration:

| Roadmap area | Recommendation | Reason |
| --- | --- | --- |
| Approval handling tests | Continue | This protects the most important differentiator: approvals must return to CX1/Human and must not become automatic. |
| Setup diagnostics | Continue | Local plugin setup remains a practical adoption risk and does not compete with CodexApp thread management. |
| Sanitized log export | Continue | Durable audit logs are valuable only if maintainers can share safe excerpts for support and issues. |
| Task summary / filtering | Continue | This improves audit and triage without exposing full prompts by default. |
| Retry policy | Continue carefully | Retry behavior must preserve state classification and must not retry approval/Human-blocked/stopped states. |
| Configurable CodexCLI path with compatibility checks | Continue carefully | Useful, but must preserve `/opt/homebrew/bin/codex` as default and fail closed on incompatible binaries. |
| Generic thread management | Stop | CodexApp and App Server are better standard owners. |
| Callback / push wake / host-side resumption | Stop or defer | Thread automations are the documented standard wake mechanism. |
| App Server lifecycle implementation | Redesign only with explicit scope | App Server is plausible as a substrate, but adding it to `0.1.x` would violate the current repo policy unless preceded by design work. |

## Decision Options

### A. Stop Development

Stop if the goal is generic background execution, thread lifecycle, worktree management, or scheduling. CodexApp already covers those areas better.

Risk: stopping also abandons the current exact-prompt approval, supervisor approval forwarding, task status classification, and full audit-log contract unless those are replaced elsewhere.

### B. Maintenance Only

Freeze runtime behavior and maintain docs, setup diagnostics, compatibility checks, and bug fixes.

This is reasonable if current local use is enough and the project should avoid competing with App Server evolution. It preserves the governance contract but does not expand it.

### C. Continue as Governance Layer

Continue narrowly as a Human-approved delegation and audit layer. Avoid generic thread management. Prioritize approval handling tests, setup diagnostics, sanitized log export, task summary/filtering, retry policy, and compatibility checks.

This best matches the verified differentiation thesis.

### D. Redesign Around App Server Integration

Redesign CX Orchestrator so App Server owns thread lifecycle while CX Orchestrator adds prompt approval, runtime freeze, approval forwarding, task classification, audit export, and CX1 gate review.

This may become attractive if App Server becomes the stable preferred low-level interface for local integrations. It is not a `0.1.x` maintenance change because the current repo policy explicitly keeps `app-server` outside the runtime path.

## Recommendation

Choose **C. Continue as Governance Layer** for the current roadmap.

Reasons:

- It accepts that CodexApp is already the standard owner of thread management, worktrees, automations, and programmatic thread lifecycle.
- It preserves the parts that are still distinct and operationally valuable: exact prompt approval, runtime visibility/freeze, approval forwarding, task state classification, audit logging, commit denial, and CX1 gate review.
- It keeps the project small and avoids implementing low-level lifecycle features that CodexApp/App Server are likely to standardize.
- It does not violate the current policy that `app-server` is not part of the `0.1.x` runtime path.

Option **B** is the conservative fallback if development capacity is limited. Option **D** should wait for a separate design artifact and explicit approval because it would change the runtime substrate. Option **A** is justified only if CodexApp/App Server later ships the stop conditions below as a complete standard contract.

## Stop Or Shrink Conditions

CX Orchestrator can stop, or shrink to a thin skill/policy layer, if CodexApp/App Server standardizes all of the following as a supported contract:

- Exact prompt approval before dispatch.
- Task-scoped runtime display and freeze.
- Approval forwarding to a supervising thread rather than direct user/auto-review handling only.
- Durable audit log export with prompt, events, approvals, stdout/stderr, result, and final summary equivalents.
- Supervisor-side gate review contract before the Human-facing final report.

Partial availability is not enough to remove the governance layer. For example, App Server thread lifecycle plus streamed events can replace low-level task control, but not the supervisor contract by itself.

## Unconfirmed Items

- Whether future CodexApp releases will expose a first-class supervisor thread model.
- Whether App Server will add stable APIs for exact pre-dispatch prompt approval and supervising-thread approval forwarding.
- Whether official durable log export will match the current CX Orchestrator audit files closely enough to replace them.
- Whether App Server's experimental or generated schemas in a specific local CodexCLI build expose additional fields beyond the manual sections checked here.
- Whether current-session thread tools will remain stable as public plugin/app APIs; they were used as environment evidence, not as a public compatibility promise.

## Core Invariant Risks

The following changes would weaken the existing CX Orchestrator contract and should be treated as high risk:

- Starting CX2 without Human-approved exact prompt text.
- Letting CX2 approval requests bypass CX1/Human.
- Removing or truncating full task logs.
- Allowing automatic CX2 approvals.
- Replacing commit denial with default CodexApp Git behavior.
- Forwarding CX2 results raw without CX1 review.
- Introducing App Server into the runtime path without a design update.
