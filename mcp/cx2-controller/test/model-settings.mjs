#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const tempRoot = mkdtempSync(join(tmpdir(), 'cx2-model-settings-test-'));
const taskRoot = join(tempRoot, 'tasks');
const fakeCodex = join(tempRoot, 'fake-codex');
const defaultsPath = join(tempRoot, 'defaults.json');

writeFileSync(fakeCodex, '#!/bin/sh\nsleep 2\n');
chmodSync(fakeCodex, 0o755);
writeFileSync(defaultsPath, JSON.stringify({
  pluginVersion: '0.1.5',
  allowedCodexBinary: fakeCodex,
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
let stderr = '';
const pending = new Map();

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

function parseTool(message) {
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
    text,
  };
}

async function toolCall(name, args) {
  return parseTool(await send('tools/call', { name, arguments: args }));
}

const baseArgs = {
  repo_path: process.cwd(),
  task_type: 'test',
  cx2_prompt_draft: 'Prepare model settings only.',
  limits: { max_runtime_minutes: 1, max_retries: 0 },
};

try {
  await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'cx2-model-settings-test', version: '0.1.5' },
  });
  notify('notifications/initialized');

  const listed = await send('tools/list', {});
  const prepareTool = listed.result?.tools?.find((tool) => tool.name === 'cx2_prepare_task');
  const startTool = listed.result?.tools?.find((tool) => tool.name === 'cx2_start_task');
  if (!prepareTool?.inputSchema?.properties?.speed_tier) throw new Error('cx2_prepare_task schema missing speed_tier');
  if (!startTool?.inputSchema?.properties?.speed_tier) throw new Error('cx2_start_task schema missing speed_tier');

  const missingCx1 = await toolCall('cx2_prepare_task', {
    ...baseArgs,
    match_cx1_settings: true,
  });
  if (!missingCx1.isError || !missingCx1.text.includes('match_cx1_settings requires')) {
    throw new Error('match_cx1_settings without explicit values should fail');
  }

  const matched = await toolCall('cx2_prepare_task', {
    ...baseArgs,
    match_cx1_settings: true,
    cx1_model: 'gpt-5.2',
    cx1_reasoning_effort: 'high',
  });
  if (matched.isError) throw new Error(matched.text);
  if (matched.body.model_settings.model !== 'gpt-5.2') throw new Error('matched model was not preserved');
  if (matched.body.model_settings.reasoning_effort !== 'high') throw new Error('matched reasoning was not preserved');
  if (matched.body.runtime_settings.speed_tier !== 'standard') throw new Error('default speed tier was not standard');
  if (matched.body.runtime_settings.service_tier !== null) throw new Error('standard speed should not set service_tier');
  if (!matched.body.human_approval_text.includes('source: match_cx1_explicit')) {
    throw new Error('human approval text did not include model settings source');
  }

  const explicit = await toolCall('cx2_prepare_task', {
    ...baseArgs,
    model: 'gpt-5.2-codex',
    reasoning_effort: 'medium',
    speed_tier: 'fast',
  });
  if (explicit.isError) throw new Error(explicit.text);
  if (explicit.body.model_settings.source !== 'explicit') throw new Error('explicit source not recorded');
  if (explicit.body.runtime_settings.model !== 'gpt-5.2-codex') throw new Error('explicit model not recorded');
  if (explicit.body.runtime_settings.reasoning_effort !== 'medium') throw new Error('explicit reasoning not recorded');
  if (explicit.body.runtime_settings.speed_tier !== 'fast') throw new Error('explicit fast speed not recorded');
  if (explicit.body.runtime_settings.service_tier !== 'fast') throw new Error('fast speed did not map to service_tier');
  if (!explicit.body.human_approval_text.includes('CX2 Model: gpt-5.2-codex')) throw new Error('approval text missing model');
  if (!explicit.body.human_approval_text.includes('CX2 Reasoning: medium')) throw new Error('approval text missing reasoning');
  if (!explicit.body.human_approval_text.includes('CX2 Speed: fast')) throw new Error('approval text missing speed');
  if (!explicit.body.human_approval_text.includes('may increase token usage')) throw new Error('fast warning missing');

  const invalidSpeed = await toolCall('cx2_prepare_task', {
    ...baseArgs,
    speed_tier: 'turbo',
  });
  if (!invalidSpeed.isError || !invalidSpeed.text.includes('speed_tier must be standard or fast')) {
    throw new Error('invalid speed_tier should fail');
  }

  const invalidReasoning = await toolCall('cx2_prepare_task', {
    ...baseArgs,
    reasoning_effort: 'fast',
  });
  if (!invalidReasoning.isError || !invalidReasoning.text.includes('reasoning_effort must be one of')) {
    throw new Error('invalid reasoning_effort should fail');
  }

  const started = await toolCall('cx2_start_task', {
    repo_path: process.cwd(),
    human_approved_prompt: 'Run fake codex for settings persistence.',
    model: 'gpt-5.2-codex',
    reasoning_effort: 'high',
    speed_tier: 'fast',
    limits: { max_runtime_minutes: 1, max_retries: 0 },
  });
  if (started.isError) throw new Error(started.text);
  if (started.body.runtime_settings.service_tier !== 'fast') throw new Error('start did not return fast service_tier');

  const saved = JSON.parse(readFileSync(join(started.body.log_dir, 'task.json'), 'utf8'));
  if (saved.runtime_settings.model !== 'gpt-5.2-codex') throw new Error('task.json did not save model');
  if (saved.runtime_settings.reasoning_effort !== 'high') throw new Error('task.json did not save reasoning');
  if (saved.runtime_settings.speed_tier !== 'fast') throw new Error('task.json did not save speed tier');
  if (saved.runtime_settings.service_tier !== 'fast') throw new Error('task.json did not save service tier');

  const polled = await toolCall('cx2_poll_task', { task_id: started.body.task_id });
  if (polled.isError) throw new Error(polled.text);
  if (polled.body.runtime_settings.speed_tier !== 'fast') throw new Error('poll did not return runtime settings');

  const result = await toolCall('cx2_get_result', { task_id: started.body.task_id });
  if (result.isError) throw new Error(result.text);
  if (result.body.runtime_settings.service_tier !== 'fast') throw new Error('result did not return runtime settings');

  console.log('model settings ok');
} catch (error) {
  console.error(stderr);
  console.error(error.stack || error.message);
  process.exitCode = 1;
} finally {
  server.kill();
  rmSync(tempRoot, { recursive: true, force: true });
}
