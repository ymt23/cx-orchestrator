#!/usr/bin/env node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = join(repoRoot, 'scripts/check-local-setup.mjs');
const tempRoot = mkdtempSync(join(tmpdir(), 'cx-setup-check-test-'));

function main() {
  try {
    testHealthySetup();
    testMissingCodexConfig();
    testMissingPluginSection();
    testDisabledPlugin();
    testMissingMarketplaceSection();
    testInvalidMarketplaceJson();
    testMissingMarketplacePlugin();
    testMarketplaceTargetMissingManifest();
    testMarketplaceTargetDiffers();
    testHelp();
    console.log('setup check tests ok');
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function testHealthySetup() {
  const fixture = createFixture('healthy');
  const result = runCheck(fixture);
  assertExit(result, 0, 'healthy setup');
  assertIncludes(result.stdout, 'Result: ok', 'healthy setup should print ok');
}

function testMissingCodexConfig() {
  const fixture = createFixture('missing-config');
  const result = runCheck({ ...fixture, codexConfig: join(fixture.root, 'missing.toml') });
  assertExit(result, 1, 'missing Codex config');
  assertIncludes(result.stdout, 'Codex config not found', 'missing Codex config should be reported');
}

function testMissingPluginSection() {
  const fixture = createFixture('missing-plugin-section', { codexConfig: codexConfig({ pluginSection: false }) });
  const result = runCheck(fixture);
  assertExit(result, 1, 'missing plugin section');
  assertIncludes(result.stdout, `missing [plugins."cx-orchestrator@local"]`, 'missing plugin section should be reported');
}

function testDisabledPlugin() {
  const fixture = createFixture('disabled-plugin', { codexConfig: codexConfig({ pluginEnabled: false }) });
  const result = runCheck(fixture);
  assertExit(result, 1, 'disabled plugin');
  assertIncludes(result.stdout, 'is not enabled', 'disabled plugin should be reported');
}

function testMissingMarketplaceSection() {
  const fixture = createFixture('missing-marketplace-section', { codexConfig: codexConfig({ marketplaceSection: false }) });
  const result = runCheck(fixture);
  assertExit(result, 1, 'missing marketplace section');
  assertIncludes(result.stdout, 'missing [marketplaces.local]', 'missing marketplace section should be reported');
}

function testInvalidMarketplaceJson() {
  const fixture = createFixture('invalid-marketplace-json', { marketplaceJson: '{bad json' });
  const result = runCheck(fixture);
  assertExit(result, 1, 'invalid marketplace JSON');
  assertIncludes(result.stdout, 'Marketplace file is not valid JSON', 'invalid JSON should be reported');
}

function testMissingMarketplacePlugin() {
  const fixture = createFixture('missing-marketplace-plugin', { marketplace: { plugins: [] } });
  const result = runCheck(fixture);
  assertExit(result, 1, 'missing marketplace plugin');
  assertIncludes(result.stdout, 'does not contain a plugin named "cx-orchestrator"', 'missing plugin should be reported');
}

function testMarketplaceTargetMissingManifest() {
  const fixture = createFixture('target-missing-manifest', {
    marketplaceTarget: 'plugins/cx-orchestrator',
    omitMarketplaceTargetManifest: true,
  });
  const result = runCheck(fixture);
  assertExit(result, 1, 'marketplace target missing manifest');
  assertIncludes(result.stdout, 'does not contain .codex-plugin/plugin.json', 'missing target manifest should be reported');
}

function testMarketplaceTargetDiffers() {
  const fixture = createFixture('target-differs', { marketplaceTarget: 'other-plugin-root' });
  writePluginRoot(join(fixture.marketplaceRoot, 'other-plugin-root'));
  const result = runCheck(fixture);
  assertExit(result, 1, 'marketplace target differs');
  assertIncludes(result.stdout, 'expected', 'different target should be reported');
}

function testHelp() {
  const result = spawnSync(process.execPath, [scriptPath, '--help'], { encoding: 'utf8' });
  assertExit(result, 0, 'help');
  assertIncludes(result.stdout, 'Usage:', 'help should print usage');
}

function createFixture(name, options = {}) {
  const root = join(tempRoot, name);
  const pluginRoot = join(root, 'plugin-root');
  const marketplaceRoot = join(root, 'marketplace-root');
  const marketplaceTarget = options.marketplaceTarget || '../plugin-root';
  const marketplaceFile = join(root, 'marketplace.json');
  const codexConfigPath = join(root, 'config.toml');

  writePluginRoot(pluginRoot);
  if (!options.omitMarketplaceTargetManifest) {
    writePluginRoot(join(marketplaceRoot, marketplaceTarget));
  } else {
    mkdirSync(join(marketplaceRoot, marketplaceTarget), { recursive: true });
  }

  writeFileSync(codexConfigPath, options.codexConfig || codexConfig({ marketplaceRoot }));

  const marketplace = options.marketplace || {
    plugins: [
      {
        name: 'cx-orchestrator',
        source: { source: 'local', path: marketplaceTarget },
      },
    ],
  };
  writeFileSync(marketplaceFile, options.marketplaceJson || JSON.stringify(marketplace, null, 2));

  return { root, pluginRoot, marketplaceRoot, marketplaceFile, codexConfig: codexConfigPath };
}

function writePluginRoot(path) {
  mkdirSync(join(path, '.codex-plugin'), { recursive: true });
  writeFileSync(join(path, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'cx-orchestrator' }, null, 2));
  writeFileSync(join(path, '.mcp.json'), JSON.stringify({ mcpServers: { cx2_controller: {} } }, null, 2));
}

function codexConfig(options = {}) {
  const pluginSection = options.pluginSection !== false;
  const marketplaceSection = options.marketplaceSection !== false;
  const pluginEnabled = options.pluginEnabled !== false;
  const marketplaceRoot = options.marketplaceRoot || '/tmp/cx-marketplace-root';
  return [
    pluginSection ? '[plugins."cx-orchestrator@local"]' : '',
    pluginSection ? `enabled = ${pluginEnabled ? 'true' : 'false'}` : '',
    '',
    marketplaceSection ? '[marketplaces.local]' : '',
    marketplaceSection ? 'source_type = "local"' : '',
    marketplaceSection ? `source = "${marketplaceRoot}"` : '',
    '',
  ].filter((line) => line !== '').join('\n');
}

function runCheck(fixture) {
  return spawnSync(process.execPath, [
    scriptPath,
    '--codex-config',
    fixture.codexConfig,
    '--marketplace-file',
    fixture.marketplaceFile,
    '--plugin-root',
    fixture.pluginRoot,
  ], { encoding: 'utf8' });
}

function assertExit(result, expected, label) {
  if (result.status !== expected) {
    throw new Error(`${label}: expected exit ${expected}, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) {
    throw new Error(`${label}: expected output to include ${JSON.stringify(expected)}\noutput:\n${value}`);
  }
}

main();
