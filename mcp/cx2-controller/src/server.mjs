#!/usr/bin/env node
import { spawn } from 'node:child_process';
import {
  appendFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_VERSION = '0.1.5';
const SERVER_NAME = 'cx2-controller';
const TASK_STATUSES = [
  'draft_prompt',
  'approved_to_send',
  'running',
  'pending_cx1_approval',
  'completed',
  'blocked_needs_cx1',
  'blocked_needs_human',
  'failed_tooling',
  'stopped_by_cx1',
];
const DEFAULT_WAIT_STATUSES = [
  'completed',
  'pending_cx1_approval',
  'blocked_needs_cx1',
  'blocked_needs_human',
  'failed_tooling',
  'stopped_by_cx1',
];
const DEFAULT_WAIT_TIMEOUT_SECONDS = 300;
const MAX_WAIT_TIMEOUT_SECONDS = 300;
const REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh'];
const SPEED_TIERS = ['standard', 'fast'];
const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '../../..');
const defaultsPath = resolve(pluginRoot, process.env.CX_ORCHESTRATOR_DEFAULTS || './mcp/cx2-controller/config/defaults.json');
const defaults = loadDefaults(defaultsPath);
const runtimeTasks = new Map();
let requestSeq = 1000;

console.error(`[${SERVER_NAME}] starting v${PLUGIN_VERSION}`);

const tools = [
  {
    name: 'cx2_prepare_task',
    description: 'Normalize a CX2 task prompt draft for Human approval. This does not start CX2 and does not write task logs.',
    inputSchema: schema({
      project_id: stringProp('Project identifier, for example riva-ios-app'),
      repo_path: stringProp('Absolute repository path for CX2'),
      task_type: stringProp('Task type such as docs-only, implementation, verification, review, test'),
      cx2_prompt_draft: stringProp('Draft prompt prepared by CX1'),
      model: stringProp('Optional CX2 Codex model override'),
      reasoning_effort: enumProp('Optional CX2 reasoning effort override', REASONING_EFFORTS),
      speed_tier: enumProp('Optional CX2 speed tier. standard omits Codex service_tier; fast maps to service_tier=fast.', SPEED_TIERS),
      match_cx1_settings: booleanProp('When true, require explicit CX1 model and reasoning values and use them for CX2.'),
      cx1_model: stringProp('Current CX1 model, supplied by CX1/Human when matching CX1 settings.'),
      cx1_reasoning_effort: stringProp('Current CX1 reasoning effort, supplied by CX1/Human when matching CX1 settings.'),
      limits: limitsProp(),
      expected_output_schema: objectProp('Optional expected output schema or shape'),
    }, ['repo_path', 'task_type', 'cx2_prompt_draft', 'limits']),
  },
  {
    name: 'cx2_start_task',
    description: 'Start a Human-approved CX2 Codex task through /opt/homebrew/bin/codex mcp-server.',
    inputSchema: schema({
      task_id: stringProp('Task id from cx2_prepare_task. Optional; generated when omitted.'),
      project_id: stringProp('Project identifier'),
      repo_path: stringProp('Absolute repository path for CX2'),
      human_approved_prompt: stringProp('Exact Human-approved CX2 prompt'),
      model: stringProp('Optional Codex model override'),
      reasoning_effort: enumProp('Optional reasoning effort override', REASONING_EFFORTS),
      speed_tier: enumProp('Optional CX2 speed tier. standard omits Codex service_tier; fast maps to service_tier=fast.', SPEED_TIERS),
      match_cx1_settings: booleanProp('When true, require explicit CX1 model and reasoning values and use them for CX2.'),
      cx1_model: stringProp('Current CX1 model, supplied by CX1/Human when matching CX1 settings.'),
      cx1_reasoning_effort: stringProp('Current CX1 reasoning effort, supplied by CX1/Human when matching CX1 settings.'),
      limits: limitsProp(),
      expected_output_schema: objectProp('Optional expected output schema or shape'),
      config: objectProp('Optional Codex config overrides'),
    }, ['repo_path', 'human_approved_prompt', 'limits']),
  },
  {
    name: 'cx2_poll_task',
    description: 'Return current CX2 task status, latest event summary, and pending approval when present.',
    inputSchema: schema({ task_id: stringProp('Task id') }, ['task_id']),
  },
  {
    name: 'cx2_wait_task',
    description: 'Wait until a CX2 task reaches a target status or the wait timeout expires. Prefer this over repeated polling.',
    inputSchema: schema({
      task_id: stringProp('Task id'),
      wait_for: {
        type: 'array',
        description: 'Statuses that should end the wait.',
        items: { type: 'string', enum: TASK_STATUSES },
        default: DEFAULT_WAIT_STATUSES,
      },
      timeout_seconds: {
        type: 'number',
        description: `Seconds to wait, capped at ${MAX_WAIT_TIMEOUT_SECONDS}.`,
        minimum: 0,
        maximum: MAX_WAIT_TIMEOUT_SECONDS,
        default: DEFAULT_WAIT_TIMEOUT_SECONDS,
      },
    }, ['task_id']),
  },
  {
    name: 'cx2_respond_approval',
    description: 'Respond to a pending CX2 approval request after Human/CX1 decides.',
    inputSchema: schema({
      task_id: stringProp('Task id'),
      approval_id: stringProp('Approval id returned by cx2_wait_task or cx2_poll_task'),
      decision: enumProp('Approval decision', ['allow', 'deny']),
      reason: stringProp('Decision reason'),
    }, ['task_id', 'approval_id', 'decision']),
  },
  {
    name: 'cx2_stop_task',
    description: 'Stop a running CX2 task.',
    inputSchema: schema({
      task_id: stringProp('Task id'),
      reason: stringProp('Stop reason'),
    }, ['task_id']),
  },
  {
    name: 'cx2_get_result',
    description: 'Return normalized final CX2 result and log paths.',
    inputSchema: schema({ task_id: stringProp('Task id') }, ['task_id']),
  },
  {
    name: 'cx2_list_tasks',
    description: 'List saved CX2 tasks from the log root.',
    inputSchema: schema({
      date: stringProp('Optional YYYYMMDD date filter'),
      limit: numberProp('Maximum tasks to return', 50),
    }),
  },
  {
    name: 'cx2_read_task_log',
    description: 'Read selected full-log artifacts for a task.',
    inputSchema: schema({
      task_id: stringProp('Task id'),
      file: enumProp('Log file to read', ['task.json', 'prompt.md', 'events.jsonl', 'stdout.log', 'stderr.log', 'approvals.jsonl', 'result.json', 'final.md']),
      max_bytes: numberProp('Maximum bytes to return from the end of the file', 200000),
    }, ['task_id', 'file']),
  },
];

function schema(properties, required = []) {
  return { type: 'object', properties, required, additionalProperties: false };
}

function stringProp(description, defaultValue) {
  const prop = { type: 'string', description };
  if (defaultValue !== undefined) prop.default = defaultValue;
  return prop;
}

function numberProp(description, defaultValue) {
  const prop = { type: 'number', description };
  if (defaultValue !== undefined) prop.default = defaultValue;
  return prop;
}

function booleanProp(description, defaultValue) {
  const prop = { type: 'boolean', description };
  if (defaultValue !== undefined) prop.default = defaultValue;
  return prop;
}

function enumProp(description, values) {
  return { type: 'string', description, enum: values };
}

function objectProp(description) {
  return { type: 'object', description, additionalProperties: true };
}

function limitsProp() {
  return {
    type: 'object',
    description: 'Execution limits. max_runtime_minutes and max_retries are required.',
    required: ['max_runtime_minutes', 'max_retries'],
    properties: {
      max_runtime_minutes: { type: 'number', minimum: 1 },
      max_retries: { type: 'integer', minimum: 0 },
      sandbox: { type: 'string', enum: ['read-only', 'workspace-write', 'danger-full-access'] },
    },
    additionalProperties: true,
  };
}

async function callTool(name, args = {}) {
  switch (name) {
    case 'cx2_prepare_task':
      return prepareTask(args);
    case 'cx2_start_task':
      return startTask(args);
    case 'cx2_poll_task':
      return pollTask(args);
    case 'cx2_wait_task':
      return waitTask(args);
    case 'cx2_respond_approval':
      return respondApproval(args);
    case 'cx2_stop_task':
      return stopTask(args);
    case 'cx2_get_result':
      return getResult(args);
    case 'cx2_list_tasks':
      return listTasks(args);
    case 'cx2_read_task_log':
      return readTaskLog(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function prepareTask(args) {
  validateStartLike(args, { requirePrompt: false });
  const taskId = args.task_id || newTaskId();
  const runtimeSettings = resolveRuntimeSettings(args);
  const normalizedPrompt = normalizePrompt({
    repoPath: args.repo_path,
    taskType: args.task_type,
    prompt: args.cx2_prompt_draft,
    expectedOutputSchema: args.expected_output_schema,
    runtimeSettings,
  });
  return {
    ok: true,
    task_id: taskId,
    status: 'draft_prompt',
    runtime_settings: runtimeSettings,
    model_settings: runtimeSettings,
    normalized_prompt: normalizedPrompt,
    human_approval_text: [
      `Task id: ${taskId}`,
      `Repo: ${args.repo_path}`,
      `Task type: ${args.task_type}`,
      runtimeSettingsSummary(runtimeSettings),
      '',
      normalizedPrompt,
    ].join('\n'),
  };
}

function startTask(args) {
  validateStartLike(args, { requirePrompt: true });
  const taskId = args.task_id || newTaskId();
  if (runtimeTasks.has(taskId)) throw new Error(`Task already running in this controller process: ${taskId}`);

  const repoPath = resolve(args.repo_path);
  const taskDir = makeTaskDir(taskId);
  const limits = normalizeLimits(args.limits);
  const runtimeSettings = resolveRuntimeSettings(args);
  const task = {
    task_id: taskId,
    project_id: args.project_id || null,
    repo_path: repoPath,
    task_type: args.task_type || null,
    status: 'approved_to_send',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    limits,
    model: runtimeSettings.model,
    reasoning_effort: runtimeSettings.reasoning_effort,
    speed_tier: runtimeSettings.speed_tier,
    service_tier: runtimeSettings.service_tier,
    runtime_settings: runtimeSettings,
    model_settings: runtimeSettings,
    expected_output_schema: args.expected_output_schema || null,
    log_dir: taskDir,
    log_paths: logPaths(taskDir),
    codex: {
      binary: defaults.allowedCodexBinary,
      thread_id: null,
      turn_id: null,
    },
    pending_approval: null,
    latest_event_summary: null,
  };

  mkdirSync(taskDir, { recursive: true });
  writeFileSync(join(taskDir, 'prompt.md'), args.human_approved_prompt);
  writeJSON(join(taskDir, 'task.json'), task);
  touch(join(taskDir, 'events.jsonl'));
  touch(join(taskDir, 'approvals.jsonl'));
  touch(join(taskDir, 'stdout.log'));
  touch(join(taskDir, 'stderr.log'));

  launchCodexTask(task, args);
  task.status = 'running';
  task.updated_at = new Date().toISOString();
  writeJSON(join(taskDir, 'task.json'), task);
  return {
    ok: true,
    task_id: taskId,
    cx2_thread_id: null,
    cx2_turn_id: null,
    status: task.status,
    runtime_settings: runtimeSettings,
    model_settings: runtimeSettings,
    log_dir: taskDir,
  };
}

function pollTask(args) {
  const task = currentTask(args.task_id);
  return {
    ok: true,
    task_id: task.task_id,
    status: task.status,
    cx2_thread_id: task.codex?.thread_id || null,
    cx2_turn_id: task.codex?.turn_id || null,
    runtime_settings: runtimeSettingsForTask(task),
    model_settings: runtimeSettingsForTask(task),
    latest_event_summary: task.latest_event_summary || null,
    pending_approval: task.pending_approval || null,
    log_dir: task.log_dir,
  };
}

async function waitTask(args) {
  const waitFor = normalizeWaitFor(args.wait_for);
  const timeoutSeconds = normalizeWaitTimeout(args.timeout_seconds);
  const deadline = Date.now() + timeoutSeconds * 1000;

  while (true) {
    const task = currentTask(args.task_id);
    if (waitFor.includes(task.status)) {
      return waitTaskPayload(task, 'state_changed');
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      return waitTaskPayload(task, 'timeout');
    }

    await sleep(Math.min(1000, remainingMs));
  }
}

function respondApproval(args) {
  const runtime = runtimeTasks.get(args.task_id);
  const task = loadTask(args.task_id);
  const pending = runtime?.pendingApproval || task.pending_approval;
  if (!pending) return { ok: false, task_id: args.task_id, error: 'No pending approval for task' };
  if (pending.approval_id !== args.approval_id) {
    return { ok: false, task_id: args.task_id, error: `Pending approval is ${pending.approval_id}, not ${args.approval_id}` };
  }
  const approved = args.decision === 'allow';
  const response = {
    jsonrpc: '2.0',
    id: pending.child_request_id,
    result: {
      approved,
      decision: approved ? 'approved' : 'denied',
      reason: args.reason || '',
    },
  };
  appendJSONL(join(task.log_dir, 'approvals.jsonl'), {
    at: new Date().toISOString(),
    type: 'approval_response',
    approval_id: args.approval_id,
    decision: args.decision,
    reason: args.reason || '',
  });
  if (runtime) {
    runtime.sendToChild(response);
    runtime.pendingApproval = null;
    runtime.task.pending_approval = null;
    runtime.task.status = 'running';
    runtime.persistTask();
  } else {
    task.pending_approval = null;
    task.status = approved ? 'running' : 'blocked_needs_cx1';
    writeJSON(join(task.log_dir, 'task.json'), task);
  }
  return { ok: true, task_id: args.task_id, status: approved ? 'running' : 'blocked_needs_cx1' };
}

function stopTask(args) {
  const task = loadTask(args.task_id);
  const runtime = runtimeTasks.get(args.task_id);
  if (runtime) {
    runtime.stop(args.reason || 'Stopped by CX1');
    runtimeTasks.delete(args.task_id);
  }
  task.status = 'stopped_by_cx1';
  task.stop_reason = args.reason || null;
  task.updated_at = new Date().toISOString();
  writeJSON(join(task.log_dir, 'task.json'), task);
  writeFinal(task, `Stopped by CX1${args.reason ? `: ${args.reason}` : ''}`);
  return { ok: true, task_id: args.task_id, status: task.status };
}

function getResult(args) {
  const task = loadTask(args.task_id);
  const resultPath = join(task.log_dir, 'result.json');
  if (existsSync(resultPath)) return JSON.parse(readFileSync(resultPath, 'utf8'));
  return {
    ok: true,
    task_id: task.task_id,
    status: task.status,
    final_message: '',
    changed_files: [],
    validation: [],
    risks: task.status === 'completed' ? [] : ['Task has not produced a normalized result yet.'],
    next_request: task.status === 'pending_cx1_approval' ? 'Respond to pending approval.' : '',
    runtime_settings: runtimeSettingsForTask(task),
    model_settings: runtimeSettingsForTask(task),
    log_paths: task.log_paths || logPaths(task.log_dir),
  };
}

function listTasks(args) {
  const root = expandHome(defaults.defaultLogRoot);
  const dates = args.date ? [args.date] : safeReaddir(root).sort().reverse();
  const out = [];
  for (const date of dates) {
    const dateDir = join(root, date);
    for (const taskId of safeReaddir(dateDir).sort().reverse()) {
      const taskPath = join(dateDir, taskId, 'task.json');
      if (!existsSync(taskPath)) continue;
      try {
        const task = JSON.parse(readFileSync(taskPath, 'utf8'));
        out.push({
          task_id: task.task_id,
          status: task.status,
          repo_path: task.repo_path,
          runtime_settings: runtimeSettingsForTask(task),
          created_at: task.created_at,
          updated_at: task.updated_at,
          log_dir: task.log_dir,
        });
      } catch {
        // Ignore malformed task records in listing.
      }
      if (out.length >= Number(args.limit || 50)) return { ok: true, tasks: out };
    }
  }
  return { ok: true, tasks: out };
}

function readTaskLog(args) {
  const task = loadTask(args.task_id);
  const filePath = join(task.log_dir, args.file);
  if (!existsSync(filePath)) return { ok: false, task_id: args.task_id, file: args.file, error: 'File not found' };
  const maxBytes = Number(args.max_bytes || 200000);
  const data = readFileSync(filePath);
  const slice = data.length > maxBytes ? data.slice(data.length - maxBytes) : data;
  return {
    ok: true,
    task_id: args.task_id,
    file: args.file,
    truncated: data.length > maxBytes,
    content: slice.toString('utf8'),
  };
}

function currentTask(taskId) {
  const task = loadTask(taskId);
  const runtime = runtimeTasks.get(taskId);
  if (runtime) Object.assign(task, runtime.publicState());
  return task;
}

function waitTaskPayload(task, waitResult) {
  return {
    ok: true,
    task_id: task.task_id,
    status: task.status,
    wait_result: waitResult,
    cx2_thread_id: task.codex?.thread_id || null,
    cx2_turn_id: task.codex?.turn_id || null,
    runtime_settings: runtimeSettingsForTask(task),
    model_settings: runtimeSettingsForTask(task),
    pending_approval: task.pending_approval || null,
    latest_event_summary: task.latest_event_summary || null,
    log_dir: task.log_dir,
    next_action: nextWaitAction(task.status, waitResult),
  };
}

function launchCodexTask(task, args) {
  const stdoutPath = join(task.log_dir, 'stdout.log');
  const stderrPath = join(task.log_dir, 'stderr.log');
  const stdoutStream = createWriteStream(stdoutPath, { flags: 'a' });
  const stderrStream = createWriteStream(stderrPath, { flags: 'a' });
  const child = spawn(defaults.allowedCodexBinary, ['mcp-server'], {
    cwd: task.repo_path,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  });
  const runtime = new CodexRuntime({ child, task, stdoutStream, stderrStream, startArgs: args });
  runtimeTasks.set(task.task_id, runtime);
  runtime.start();
}

class CodexRuntime {
  constructor({ child, task, stdoutStream, stderrStream, startArgs }) {
    this.child = child;
    this.task = task;
    this.stdoutStream = stdoutStream;
    this.stderrStream = stderrStream;
    this.startArgs = startArgs;
    this.input = Buffer.alloc(0);
    this.initId = nextRequestId();
    this.callId = nextRequestId();
    this.pendingApproval = null;
    this.finalContent = '';
    this.timeout = null;
  }

  start() {
    this.child.stdout.on('data', (chunk) => {
      this.stdoutStream.write(chunk);
      this.input = Buffer.concat([this.input, chunk]);
      this.readMessages();
    });
    this.child.stderr.on('data', (chunk) => {
      this.stderrStream.write(chunk);
    });
    this.child.on('exit', (code, signal) => {
      this.stdoutStream.end();
      this.stderrStream.end();
      if (this.timeout) clearTimeout(this.timeout);
      const current = loadTask(this.task.task_id);
      if (!['completed', 'stopped_by_cx1', 'blocked_needs_cx1', 'blocked_needs_human'].includes(current.status)) {
        current.status = code === 0 ? 'completed' : 'failed_tooling';
        current.exit = { code, signal };
        current.updated_at = new Date().toISOString();
        writeJSON(join(current.log_dir, 'task.json'), current);
        writeResult(current, this.finalContent || `Codex process exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`);
      }
      runtimeTasks.delete(this.task.task_id);
    });
    this.sendToChild({
      jsonrpc: '2.0',
      id: this.initId,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'cx2-controller', version: PLUGIN_VERSION },
      },
    });
    this.timeout = setTimeout(() => {
      this.task.status = 'failed_tooling';
      this.task.failure_reason = `Timed out after ${this.task.limits.max_runtime_minutes} minutes`;
      this.persistTask();
      writeResult(this.task, this.task.failure_reason);
      this.child.kill('SIGTERM');
    }, Number(this.task.limits.max_runtime_minutes) * 60 * 1000);
  }

  sendInitialCodexCall() {
    this.sendToChild({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    const limits = this.task.limits;
    const codexArgs = {
      prompt: this.startArgs.human_approved_prompt,
      cwd: this.task.repo_path,
      sandbox: limits.sandbox || defaults.defaultSandbox,
      'approval-policy': defaults.approvalPolicy,
      'developer-instructions': cx2DeveloperInstructions(this.startArgs.expected_output_schema),
      config: this.startArgs.config || {},
    };
    if (this.task.model) codexArgs.model = this.task.model;
    if (this.task.reasoning_effort) {
      codexArgs.config = { ...codexArgs.config, model_reasoning_effort: this.task.reasoning_effort };
    }
    if (this.task.service_tier) {
      codexArgs.config = { ...codexArgs.config, service_tier: this.task.service_tier };
    }
    this.sendToChild({
      jsonrpc: '2.0',
      id: this.callId,
      method: 'tools/call',
      params: { name: 'codex', arguments: codexArgs },
    });
  }

  sendToChild(message) {
    appendJSONL(join(this.task.log_dir, 'events.jsonl'), {
      at: new Date().toISOString(),
      direction: 'controller_to_codex',
      message,
    });
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  readMessages() {
    while (this.input.length > 0) {
      if (/^content-length:/i.test(this.input.toString('utf8', 0, Math.min(this.input.length, 64)))) {
        if (!this.readContentLengthMessage()) return;
        continue;
      }
      const lineEnd = this.input.indexOf('\n');
      if (lineEnd === -1) return;
      const line = this.input.slice(0, lineEnd).toString('utf8').trim();
      this.input = this.input.slice(lineEnd + 1);
      if (line.length === 0) continue;
      this.handleBody(line);
    }
  }

  readContentLengthMessage() {
    const headerEnd = this.input.indexOf('\r\n\r\n');
    if (headerEnd === -1) return false;
    const header = this.input.slice(0, headerEnd).toString('utf8');
    const match = /content-length:\s*(\d+)/i.exec(header);
    if (!match) {
      this.input = this.input.slice(headerEnd + 4);
      return true;
    }
    const length = Number(match[1]);
    const start = headerEnd + 4;
    const end = start + length;
    if (this.input.length < end) return false;
    const body = this.input.slice(start, end).toString('utf8');
    this.input = this.input.slice(end);
    this.handleBody(body);
    return true;
  }

  handleBody(body) {
    try {
      this.handleMessage(JSON.parse(body));
    } catch (error) {
      appendJSONL(join(this.task.log_dir, 'events.jsonl'), {
        at: new Date().toISOString(),
        direction: 'codex_to_controller_parse_error',
        error: error.message,
        body,
      });
    }
  }

  handleMessage(message) {
    appendJSONL(join(this.task.log_dir, 'events.jsonl'), {
      at: new Date().toISOString(),
      direction: 'codex_to_controller',
      message,
    });

    if (message.id === this.initId && message.result) {
      this.task.codex.server_info = message.result.serverInfo || null;
      this.persistTask();
      this.sendInitialCodexCall();
      return;
    }

    if (message.method === 'codex/event') {
      this.handleCodexEvent(message.params || {});
      return;
    }

    if (message.id === this.callId) {
      const content = extractToolContent(message);
      this.finalContent = content || this.finalContent;
      this.task.status = message.error ? 'failed_tooling' : 'completed';
      this.task.updated_at = new Date().toISOString();
      this.persistTask();
      writeResult(this.task, this.finalContent);
      return;
    }

    if (message.id !== undefined && message.method) {
      this.registerApproval(message);
    }
  }

  handleCodexEvent(params) {
    const msg = params.msg || {};
    const meta = params._meta || {};
    if (meta.threadId) this.task.codex.thread_id = meta.threadId;
    if (msg.turn_id) this.task.codex.turn_id = msg.turn_id;
    if (msg.type === 'task_started' && msg.turn_id) this.task.codex.turn_id = msg.turn_id;
    if (msg.type === 'agent_message' && msg.message) this.finalContent = msg.message;
    if (msg.type === 'task_complete') {
      this.finalContent = msg.last_agent_message || this.finalContent;
      this.task.status = 'completed';
    }
    if (String(msg.type || '').toLowerCase().includes('approval')) {
      this.registerApproval({ id: nextRequestId(), method: 'codex/event-approval', params });
      return;
    }
    this.task.latest_event_summary = summarizeEvent(msg);
    this.task.updated_at = new Date().toISOString();
    this.persistTask();
  }

  registerApproval(message) {
    const approvalId = `ap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const approval = {
      approval_id: approvalId,
      task_id: this.task.task_id,
      child_request_id: message.id,
      kind: message.method || 'approval',
      status: 'pending',
      summary: approvalSummary(message),
      raw: message,
    };
    this.pendingApproval = approval;
    this.task.pending_approval = approval;
    this.task.status = 'pending_cx1_approval';
    this.task.latest_event_summary = approval.summary;
    this.task.updated_at = new Date().toISOString();
    appendJSONL(join(this.task.log_dir, 'approvals.jsonl'), {
      at: new Date().toISOString(),
      type: 'approval_request',
      approval,
    });
    this.persistTask();
  }

  publicState() {
    return {
      status: this.task.status,
      pending_approval: this.pendingApproval,
      latest_event_summary: this.task.latest_event_summary,
      codex: this.task.codex,
      runtime_settings: runtimeSettingsForTask(this.task),
      model_settings: runtimeSettingsForTask(this.task),
    };
  }

  persistTask() {
    writeJSON(join(this.task.log_dir, 'task.json'), this.task);
  }

  stop(reason) {
    appendJSONL(join(this.task.log_dir, 'events.jsonl'), {
      at: new Date().toISOString(),
      direction: 'controller_stop',
      reason,
    });
    this.child.kill('SIGTERM');
  }
}

function cx2DeveloperInstructions(expectedOutputSchema) {
  return [
    'You are CX2 = SE / Implementation Engineer.',
    'You execute only the Human-approved task from CX1.',
    'Check git status --short first.',
    'Do not commit unless the prompt explicitly says commit is approved.',
    'If requirements are ambiguous, stop and report blocked_needs_cx1 instead of guessing.',
    'If shell or patch approval is needed, wait for approval; do not work around it.',
    'Final response must include: status, changed files, summary, validation, risks, next request.',
    expectedOutputSchema ? `Expected output schema or shape:\n${JSON.stringify(expectedOutputSchema, null, 2)}` : '',
  ].filter(Boolean).join('\n');
}

function normalizePrompt({ repoPath, taskType, prompt, expectedOutputSchema, runtimeSettings }) {
  return [
    'Role:',
    '- CX2 = SE / Implementation Engineer',
    '',
    `Repo: ${repoPath}`,
    `Task type: ${taskType}`,
    '',
    'Runtime:',
    `- model: ${runtimeSettings.model || 'CodexCLI default'}`,
    `- reasoning_effort: ${runtimeSettings.reasoning_effort || 'CodexCLI default'}`,
    `- speed_tier: ${runtimeSettings.speed_tier}`,
    `- service_tier: ${runtimeSettings.service_tier || 'CodexCLI default'}`,
    `- runtime_settings_source: ${runtimeSettings.source}`,
    '',
    'Rules:',
    '- Work only on the Human-approved task.',
    '- Check git status --short first.',
    '- Do not commit unless explicitly approved.',
    '- Stop with blocked_needs_cx1 if requirements are ambiguous.',
    '',
    'CX1 instruction:',
    prompt.trim(),
    expectedOutputSchema ? `\nExpected output schema:\n${JSON.stringify(expectedOutputSchema, null, 2)}` : '',
  ].join('\n');
}

function validateStartLike(args, { requirePrompt }) {
  const repoPath = args.repo_path;
  if (!repoPath || !repoPath.startsWith('/')) throw new Error('repo_path must be an absolute path');
  if (!existsSync(repoPath) || !statSync(repoPath).isDirectory()) throw new Error(`repo_path is not a directory: ${repoPath}`);
  if (requirePrompt && !args.human_approved_prompt) throw new Error('human_approved_prompt is required');
  if (!requirePrompt && !args.cx2_prompt_draft) throw new Error('cx2_prompt_draft is required');
  normalizeLimits(args.limits);
  if (!existsSync(defaults.allowedCodexBinary)) throw new Error(`Codex binary not found: ${defaults.allowedCodexBinary}`);
}

function resolveRuntimeSettings(args = {}) {
  const explicitModel = nonEmpty(args.model);
  const explicitReasoning = normalizeReasoningEffort(nonEmpty(args.reasoning_effort), 'reasoning_effort');
  const cx1Model = nonEmpty(args.cx1_model);
  const cx1Reasoning = normalizeReasoningEffort(nonEmpty(args.cx1_reasoning_effort), 'cx1_reasoning_effort');
  const defaultModel = nonEmpty(defaults.defaultModel);
  const defaultReasoning = normalizeReasoningEffort(nonEmpty(defaults.defaultReasoningEffort), 'defaultReasoningEffort');
  const speed = normalizeSpeedTier(args.speed_tier);
  const serviceTier = speed === 'fast' ? 'fast' : null;

  if (args.match_cx1_settings === true) {
    const model = explicitModel || cx1Model;
    const reasoning = explicitReasoning || cx1Reasoning;
    if (!model || !reasoning) {
      throw new Error('match_cx1_settings requires cx1_model and cx1_reasoning_effort, or explicit model and reasoning_effort');
    }
    return {
      model,
      reasoning_effort: reasoning,
      speed_tier: speed,
      service_tier: serviceTier,
      source: 'match_cx1_explicit',
      match_cx1_settings: true,
      note: 'CX1 settings are not auto-detected by the controller; they were supplied explicitly.',
    };
  }

  const model = explicitModel || defaultModel || null;
  const reasoning = explicitReasoning || defaultReasoning || null;
  let source = 'codex_default';
  if (explicitModel || explicitReasoning || speed === 'fast') source = 'explicit';
  else if (defaultModel || defaultReasoning) source = 'controller_default';

  return {
    model,
    reasoning_effort: reasoning,
    speed_tier: speed,
    service_tier: serviceTier,
    source,
    match_cx1_settings: false,
    note: source === 'codex_default'
      ? 'No CX2 runtime override was provided; CodexCLI defaults will be used.'
      : '',
  };
}

function runtimeSettingsForTask(task = {}) {
  const settings = task.runtime_settings || task.model_settings || {};
  return {
    model: settings.model || task.model || null,
    reasoning_effort: settings.reasoning_effort || task.reasoning_effort || null,
    speed_tier: settings.speed_tier || task.speed_tier || 'standard',
    service_tier: settings.service_tier || task.service_tier || null,
    source: settings.source || 'legacy_task',
    match_cx1_settings: settings.match_cx1_settings === true,
    note: settings.note || '',
  };
}

function runtimeSettingsSummary(runtimeSettings) {
  return [
    'CX2 Runtime:',
    `- CX2 Model: ${runtimeSettings.model || 'CodexCLI default'}`,
    `- CX2 Reasoning: ${runtimeSettings.reasoning_effort || 'CodexCLI default'}`,
    `- CX2 Speed: ${runtimeSettings.speed_tier}`,
    runtimeSettings.speed_tier === 'fast' ? '- note: fast can return faster but may increase token usage.' : '',
    `- source: ${runtimeSettings.source}`,
    runtimeSettings.note ? `- note: ${runtimeSettings.note}` : '',
  ].filter(Boolean).join('\n');
}

function normalizeSpeedTier(value) {
  if (value === undefined || value === null || value === '') return 'standard';
  if (typeof value !== 'string') throw new Error('speed_tier must be standard or fast');
  const speed = value.trim();
  if (!SPEED_TIERS.includes(speed)) throw new Error('speed_tier must be standard or fast');
  return speed;
}

function normalizeReasoningEffort(value, fieldName) {
  if (!value) return null;
  if (!REASONING_EFFORTS.includes(value)) {
    throw new Error(`${fieldName} must be one of ${REASONING_EFFORTS.join(', ')}`);
  }
  return value;
}

function nonEmpty(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLimits(limits = {}) {
  if (limits.max_runtime_minutes === undefined) throw new Error('limits.max_runtime_minutes is required');
  if (limits.max_retries === undefined) throw new Error('limits.max_retries is required');
  const maxRuntime = Number(limits.max_runtime_minutes);
  const maxRetries = Number(limits.max_retries);
  if (!Number.isFinite(maxRuntime) || maxRuntime < 1) throw new Error('limits.max_runtime_minutes must be >= 1');
  if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new Error('limits.max_retries must be an integer >= 0');
  return {
    ...limits,
    max_runtime_minutes: maxRuntime,
    max_retries: maxRetries,
    sandbox: limits.sandbox || defaults.defaultSandbox,
  };
}

function normalizeWaitFor(waitFor) {
  if (waitFor === undefined) return DEFAULT_WAIT_STATUSES;
  if (!Array.isArray(waitFor) || waitFor.length === 0) throw new Error('wait_for must be a non-empty array when provided');
  for (const status of waitFor) {
    if (!TASK_STATUSES.includes(status)) throw new Error(`Unknown wait status: ${status}`);
  }
  return waitFor;
}

function normalizeWaitTimeout(timeoutSeconds) {
  if (timeoutSeconds === undefined) return DEFAULT_WAIT_TIMEOUT_SECONDS;
  const value = Number(timeoutSeconds);
  if (!Number.isFinite(value) || value < 0) throw new Error('timeout_seconds must be >= 0');
  if (value > MAX_WAIT_TIMEOUT_SECONDS) throw new Error(`timeout_seconds must be <= ${MAX_WAIT_TIMEOUT_SECONDS}`);
  return value;
}

function nextWaitAction(status, waitResult) {
  if (waitResult === 'timeout') return 'continue_waiting_or_poll';
  if (status === 'pending_cx1_approval') return 'ask_human_then_call_cx2_respond_approval';
  if (status === 'completed') return 'call_cx2_get_result_and_review';
  if (status === 'blocked_needs_cx1' || status === 'blocked_needs_human') return 'review_blocker_and_ask_human_if_needed';
  if (status === 'failed_tooling') return 'inspect_logs_or_retry_with_new_task';
  if (status === 'stopped_by_cx1') return 'report_stopped_status';
  return 'continue_waiting_or_poll';
}

function summarizeEvent(msg) {
  if (!msg || typeof msg !== 'object') return null;
  if (msg.type === 'agent_message') return `agent_message: ${String(msg.message || '').slice(0, 200)}`;
  if (msg.type === 'task_complete') return `task_complete: ${String(msg.last_agent_message || '').slice(0, 200)}`;
  if (msg.type === 'mcp_startup_update') return `mcp_startup_update: ${msg.server} ${msg.status?.state || ''}`;
  if (msg.type) return String(msg.type);
  return JSON.stringify(msg).slice(0, 200);
}

function approvalSummary(message) {
  const method = message.method || 'approval';
  const params = message.params || {};
  const msg = params.msg || params;
  return `${method}: ${JSON.stringify(msg).slice(0, 1000)}`;
}

function extractToolContent(message) {
  const structured = message.result?.structuredContent;
  if (structured?.content) return structured.content;
  const content = message.result?.content;
  if (Array.isArray(content)) {
    return content.map((part) => part.text || '').join('\n').trim();
  }
  if (message.error) return JSON.stringify(message.error);
  return '';
}

function writeResult(task, finalMessage) {
  const result = {
    ok: true,
    task_id: task.task_id,
    status: task.status,
    final_message: finalMessage || '',
    changed_files: [],
    validation: [],
    risks: task.status === 'failed_tooling' ? [task.failure_reason || 'Codex tooling failed'] : [],
    next_request: '',
    runtime_settings: runtimeSettingsForTask(task),
    model_settings: runtimeSettingsForTask(task),
    log_paths: task.log_paths || logPaths(task.log_dir),
  };
  writeJSON(join(task.log_dir, 'result.json'), result);
  writeFinal(task, finalMessage || '');
}

function writeFinal(task, finalMessage) {
  writeFileSync(join(task.log_dir, 'final.md'), [
    `# CX2 Task ${task.task_id}`,
    '',
    `Status: ${task.status}`,
    `Repo: ${task.repo_path}`,
    '',
    '## Final Message',
    '',
    finalMessage || '',
    '',
    '## Logs',
    '',
    `- task: ${join(task.log_dir, 'task.json')}`,
    `- events: ${join(task.log_dir, 'events.jsonl')}`,
    `- stdout: ${join(task.log_dir, 'stdout.log')}`,
    `- stderr: ${join(task.log_dir, 'stderr.log')}`,
    `- approvals: ${join(task.log_dir, 'approvals.jsonl')}`,
  ].join('\n'));
}

function loadTask(taskId) {
  const taskPath = findTaskPath(taskId);
  if (!taskPath) throw new Error(`Task not found: ${taskId}`);
  return JSON.parse(readFileSync(taskPath, 'utf8'));
}

function findTaskPath(taskId) {
  const root = expandHome(defaults.defaultLogRoot);
  for (const date of safeReaddir(root)) {
    const candidate = join(root, date, taskId, 'task.json');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function makeTaskDir(taskId) {
  const date = taskId.split('-')[1] || yyyymmdd();
  return join(expandHome(defaults.defaultLogRoot), date, taskId);
}

function logPaths(taskDir) {
  return {
    task: join(taskDir, 'task.json'),
    prompt: join(taskDir, 'prompt.md'),
    events: join(taskDir, 'events.jsonl'),
    stdout: join(taskDir, 'stdout.log'),
    stderr: join(taskDir, 'stderr.log'),
    approvals: join(taskDir, 'approvals.jsonl'),
    result: join(taskDir, 'result.json'),
    final: join(taskDir, 'final.md'),
  };
}

function newTaskId() {
  const now = new Date();
  const date = yyyymmdd(now);
  const time = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return `cx2-${date}-${time}-${Math.random().toString(36).slice(2, 8)}`;
}

function yyyymmdd(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('');
}

function nextRequestId() {
  requestSeq += 1;
  return requestSeq;
}

function loadDefaults(path) {
  const fallback = {
    allowedCodexBinary: '/opt/homebrew/bin/codex',
    defaultLogRoot: '~/.codex/cx-orchestrator/tasks',
    defaultSandbox: 'workspace-write',
    approvalPolicy: 'on-request',
    defaultModel: null,
    defaultReasoningEffort: null,
  };
  try {
    return { ...fallback, ...JSON.parse(readFileSync(path, 'utf8')) };
  } catch {
    return fallback;
  }
}

function expandHome(path) {
  if (path === '~') return process.env.HOME || path;
  if (path.startsWith('~/')) return join(process.env.HOME || '', path.slice(2));
  return path;
}

function safeReaddir(path) {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function writeJSON(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function appendJSONL(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(value)}\n`);
}

function touch(path) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, '');
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(message) {
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion || '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: PLUGIN_VERSION },
        instructions: 'CX2 Controller MCP starts, monitors, stops, and records Human-approved CodexCLI CX2 tasks for a CX1 CodexApp chat.',
      },
    });
    return;
  }
  if (message.method === 'notifications/initialized') return;
  if (message.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: message.id, result: { tools } });
    return;
  }
  if (message.method === 'tools/call') {
    try {
      const result = await callTool(message.params?.name, message.params?.arguments || {});
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: result && result.ok === false,
        },
      });
    } catch (error) {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{ type: 'text', text: error.stack || error.message }],
          isError: true,
        },
      });
    }
    return;
  }
  if (message.id !== undefined) {
    send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } });
  }
}

let input = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  input = Buffer.concat([input, chunk]);
  readMessages();
});

function readMessages() {
  while (input.length > 0) {
    if (/^content-length:/i.test(input.toString('utf8', 0, Math.min(input.length, 64)))) {
      if (!readContentLengthMessage()) return;
      continue;
    }
    const lineEnd = input.indexOf('\n');
    if (lineEnd === -1) return;
    const line = input.slice(0, lineEnd).toString('utf8').trim();
    input = input.slice(lineEnd + 1);
    if (line.length === 0) continue;
    handleBody(line);
  }
}

function readContentLengthMessage() {
  const headerEnd = input.indexOf('\r\n\r\n');
  if (headerEnd === -1) return false;
  const header = input.slice(0, headerEnd).toString('utf8');
  const match = /content-length:\s*(\d+)/i.exec(header);
  if (!match) {
    input = input.slice(headerEnd + 4);
    return true;
  }
  const length = Number(match[1]);
  const start = headerEnd + 4;
  const end = start + length;
  if (input.length < end) return false;
  const body = input.slice(start, end).toString('utf8');
  input = input.slice(end);
  handleBody(body);
  return true;
}

function handleBody(body) {
  try {
    Promise.resolve(handle(JSON.parse(body))).catch((error) => {
      send({ jsonrpc: '2.0', error: { code: -32603, message: error.message } });
    });
  } catch (error) {
    send({ jsonrpc: '2.0', error: { code: -32700, message: error.message } });
  }
}
