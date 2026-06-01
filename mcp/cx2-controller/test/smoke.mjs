#!/usr/bin/env node
import { spawn } from 'node:child_process';

const server = spawn('node', ['src/server.mjs'], {
  cwd: new URL('..', import.meta.url),
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
server.stdout.on('data', (chunk) => { stdout += chunk; });
server.stderr.on('data', (chunk) => { stderr += chunk; });

function send(message) {
  server.stdin.write(`${JSON.stringify(message)}\n`);
}

send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'cx2-controller-smoke', version: '0.1.0' },
  },
});

setTimeout(() => send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }), 100);
setTimeout(() => send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }), 200);
setTimeout(() => {
  server.kill();
  if (!stdout.includes('cx2_prepare_task') || !stdout.includes('cx2_start_task') || !stdout.includes('cx2_wait_task')) {
    console.error(stderr);
    console.error(stdout);
    process.exit(1);
  }
  console.log('smoke ok');
}, 1000);
