#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const tempRoot = mkdtempSync(join(tmpdir(), 'cx2-wait-test-'));
const taskRoot = join(tempRoot, 'tasks');
const defaultsPath = join(tempRoot, 'defaults.json');

writeFileSync(defaultsPath, JSON.stringify({
  pluginVersion: '0.1.5',
  allowedCodexBinary: '/opt/homebrew/bin/codex',
  defaultLogRoot: taskRoot,
  defaultSandbox: 'workspace-write',
  approvalPolicy: 'on-request',
  commitPolicy: 'deny-unless-explicit',
  appServer: false,
}, null, 2));

const server = spawn('node', ['src/server.mjs'], {
  cwd: new URL('..', import.meta.url),
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, CX_ORCHESTRATOR_DEFAULTS: defaultsPath },
});

let nextId = 1;
let input = Buffer.alloc(0);
const pending = new Map();
let stderr = '';

server.stderr.on('data', (chunk) => { stderr += chunk; });
server.stdout.on('data', (chunk) => {
  input = Buffer.concat([input, chunk]);
  readMessages();
});

function send(method, params) {
  const id = nextId++;
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }
    }, 5000);
  });
}

function notify(method, params = {}) {
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
}

function readMessages() {
  while (input.length > 0) {
    const lineEnd = input.indexOf('\n');
    if (lineEnd === -1) return;
    const line = input.slice(0, lineEnd).toString('utf8').trim();
    input = input.slice(lineEnd + 1);
    if (line.length === 0) continue;
    const message = JSON.parse(line);
    const waiter = pending.get(message.id);
    if (waiter) {
      pending.delete(message.id);
      waiter.resolve(message);
    }
  }
}

function writeTask(taskId, status, extra = {}) {
  const date = taskId.split('-')[1];
  const logDir = join(taskRoot, date, taskId);
  mkdirSync(logDir, { recursive: true });
  const task = {
    task_id: taskId,
    status,
    repo_path: tempRoot,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    log_dir: logDir,
    log_paths: {},
    codex: { binary: '/opt/homebrew/bin/codex', thread_id: null, turn_id: null },
    pending_approval: null,
    latest_event_summary: null,
    ...extra,
  };
  writeFileSync(join(logDir, 'task.json'), JSON.stringify(task, null, 2));
  return { task, logDir };
}

function toolCall(name, args) {
  return send('tools/call', { name, arguments: args }).then((message) => {
    const text = message.result?.content?.[0]?.text || '{}';
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text };
    }
    return {
      isError: Boolean(message.result?.isError),
      body,
      rawText: text,
    };
  });
}

try {
  await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'cx2-wait-test', version: '0.1.5' },
  });
  notify('notifications/initialized');

  const missing = await toolCall('cx2_wait_task', { task_id: 'cx2-20260520-000000-missing', timeout_seconds: 0 });
  if (!missing.isError) throw new Error('missing task should return an MCP tool error');

  writeTask('cx2-20260520-000001-done01', 'completed');
  const completed = await toolCall('cx2_wait_task', { task_id: 'cx2-20260520-000001-done01' });
  if (completed.body.wait_result !== 'state_changed' || completed.body.status !== 'completed') {
    throw new Error(`completed task did not return immediately: ${completed.rawText}`);
  }

  const running = writeTask('cx2-20260520-000002-run001', 'running');
  const timedOut = await toolCall('cx2_wait_task', {
    task_id: 'cx2-20260520-000002-run001',
    wait_for: ['completed'],
    timeout_seconds: 1,
  });
  if (timedOut.body.wait_result !== 'timeout' || timedOut.body.status !== 'running') {
    throw new Error(`running task did not timeout cleanly: ${timedOut.rawText}`);
  }
  const runningAfter = JSON.parse(readFileSync(join(running.logDir, 'task.json'), 'utf8'));
  if (runningAfter.status !== 'running') throw new Error('timeout changed task status');

  writeTask('cx2-20260520-000003-appr01', 'pending_cx1_approval', {
    pending_approval: { approval_id: 'ap-test', summary: 'needs approval' },
  });
  const approval = await toolCall('cx2_wait_task', { task_id: 'cx2-20260520-000003-appr01' });
  if (approval.body.status !== 'pending_cx1_approval' || approval.body.pending_approval?.approval_id !== 'ap-test') {
    throw new Error(`pending approval was not returned: ${approval.rawText}`);
  }

  console.log('wait ok');
} catch (error) {
  console.error(stderr);
  console.error(error.stack || error.message);
  process.exitCode = 1;
} finally {
  server.kill();
  rmSync(tempRoot, { recursive: true, force: true });
}
