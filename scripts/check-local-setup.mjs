#!/usr/bin/env node
import { existsSync, realpathSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_NAME = 'cx-orchestrator';
const PLUGIN_ID = 'cx-orchestrator@local';
const LOCAL_MARKETPLACE = 'local';

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printUsage();
      process.exitCode = 0;
      return;
    }

    const report = runChecks(options);
    printReport(report);
    process.exitCode = report.failures.length > 0 ? 1 : 0;
  } catch (error) {
    console.error(`ERROR ${error.message}`);
    console.error('');
    printUsage();
    process.exitCode = 2;
  }
}

function parseArgs(argv) {
  const options = {
    codexConfig: expandHome('~/.codex/config.toml'),
    marketplaceFile: expandHome('~/.agents/plugins/marketplace.json'),
    pluginRoot: defaultPluginRoot(),
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--codex-config') {
      options.codexConfig = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--marketplace-file') {
      options.marketplaceFile = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--plugin-root') {
      options.pluginRoot = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return {
    ...options,
    codexConfig: resolvePath(options.codexConfig),
    marketplaceFile: resolvePath(options.marketplaceFile),
    pluginRoot: resolvePath(options.pluginRoot),
  };
}

function requireValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${optionName} requires a value`);
  return value;
}

function printUsage() {
  console.log(`Usage: node scripts/check-local-setup.mjs [options]

Options:
  --codex-config <path>       Codex config file. Default: ~/.codex/config.toml
  --marketplace-file <path>   Local marketplace file. Default: ~/.agents/plugins/marketplace.json
  --plugin-root <path>        Plugin root. Default: current repository root
  --help                      Show this help text

This command only reads local files. It does not modify Codex config, marketplace files, or plugin files.`);
}

function runChecks(options) {
  const report = { passes: [], warnings: [], failures: [] };
  let pluginManifest = null;
  let mcpConfig = null;
  let codexConfig = null;
  let marketplace = null;

  const manifestPath = resolve(options.pluginRoot, '.codex-plugin/plugin.json');
  const mcpPath = resolve(options.pluginRoot, '.mcp.json');

  try {
    pluginManifest = readJson(manifestPath);
    if (pluginManifest.name === PLUGIN_NAME) {
      pass(report, `Plugin manifest is readable at ${manifestPath}`);
    } else {
      fail(report, `Plugin manifest name is ${formatValue(pluginManifest.name)}, expected "${PLUGIN_NAME}".`, `Check ${manifestPath}.`);
    }
  } catch (error) {
    fail(report, `Plugin manifest is not readable JSON at ${manifestPath}.`, error.message);
  }

  try {
    mcpConfig = readJson(mcpPath);
    if (mcpConfig?.mcpServers?.cx2_controller) {
      pass(report, `MCP config includes mcpServers.cx2_controller at ${mcpPath}`);
    } else {
      fail(report, `MCP config does not include mcpServers.cx2_controller at ${mcpPath}.`, `Check ${mcpPath}.`);
    }
  } catch (error) {
    fail(report, `MCP config is not readable JSON at ${mcpPath}.`, error.message);
  }

  if (!existsSync(options.codexConfig)) {
    fail(report, `Codex config not found at ${options.codexConfig}.`, 'Add the documented plugin and marketplace sections to this file.');
  } else {
    try {
      codexConfig = parseDocumentedToml(readFileSync(options.codexConfig, 'utf8'));
      pass(report, `Codex config is readable at ${options.codexConfig}`);
      checkCodexPluginSection(report, codexConfig, options.codexConfig);
      checkCodexMarketplaceSection(report, codexConfig, options.codexConfig);
    } catch (error) {
      fail(report, `Codex config could not be scanned at ${options.codexConfig}.`, error.message);
    }
  }

  if (!existsSync(options.marketplaceFile)) {
    fail(report, `Marketplace file not found at ${options.marketplaceFile}.`, 'Create or point --marketplace-file to the local marketplace.json file.');
  } else {
    try {
      marketplace = readJson(options.marketplaceFile);
      pass(report, `Marketplace file is valid JSON at ${options.marketplaceFile}`);
      checkMarketplaceEntry(report, {
        marketplace,
        marketplaceFile: options.marketplaceFile,
        codexConfig,
        pluginRoot: options.pluginRoot,
        manifestPath,
      });
    } catch (error) {
      fail(report, `Marketplace file is not valid JSON at ${options.marketplaceFile}.`, error.message);
    }
  }

  if (pluginManifest && mcpConfig && codexConfig && marketplace && report.failures.length === 0) {
    pass(report, 'Local marketplace setup looks consistent for cx-orchestrator@local.');
  }

  return report;
}

function checkCodexPluginSection(report, config, configPath) {
  const section = config.sections[`plugins."${PLUGIN_ID}"`];
  if (!section) {
    fail(report, `Codex config is missing [plugins."${PLUGIN_ID}"].`, `Add [plugins."${PLUGIN_ID}"] with enabled = true to ${configPath}.`);
    return;
  }
  if (section.enabled === true) {
    pass(report, `[plugins."${PLUGIN_ID}"] is enabled`);
  } else {
    fail(report, `[plugins."${PLUGIN_ID}"] is not enabled.`, `Set enabled = true in ${configPath}.`);
  }
}

function checkCodexMarketplaceSection(report, config, configPath) {
  const section = config.sections[`marketplaces.${LOCAL_MARKETPLACE}`];
  if (!section) {
    fail(report, `Codex config is missing [marketplaces.${LOCAL_MARKETPLACE}].`, `Add [marketplaces.${LOCAL_MARKETPLACE}] with source_type = "local" and source = "/path/to/local/marketplace/root" to ${configPath}.`);
    return;
  }

  if (section.source_type === 'local') {
    pass(report, `[marketplaces.${LOCAL_MARKETPLACE}] uses source_type = "local"`);
  } else {
    fail(report, `[marketplaces.${LOCAL_MARKETPLACE}] source_type is ${formatValue(section.source_type)}, expected "local".`, `Set source_type = "local" in ${configPath}.`);
  }

  if (typeof section.source === 'string' && section.source.trim().length > 0) {
    pass(report, `[marketplaces.${LOCAL_MARKETPLACE}] has a source path`);
  } else {
    fail(report, `[marketplaces.${LOCAL_MARKETPLACE}] source is missing or empty.`, `Set source = "/path/to/local/marketplace/root" in ${configPath}.`);
  }
}

function checkMarketplaceEntry(report, { marketplace, marketplaceFile, codexConfig, pluginRoot, manifestPath }) {
  const plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  const entry = plugins.find((plugin) => plugin?.name === PLUGIN_NAME);
  if (!entry) {
    fail(report, `Marketplace does not contain a plugin named "${PLUGIN_NAME}".`, `Add the ${PLUGIN_NAME} entry to ${marketplaceFile}.`);
    return;
  }
  pass(report, `Marketplace contains plugin entry "${PLUGIN_NAME}"`);

  const source = entry.source || {};
  if (source.source !== 'local') {
    fail(report, `Marketplace entry source.source is ${formatValue(source.source)}, expected "local".`, `Set source.source = "local" for ${PLUGIN_NAME}.`);
    return;
  }
  pass(report, `Marketplace entry "${PLUGIN_NAME}" uses local source`);

  if (typeof source.path !== 'string' || source.path.trim().length === 0) {
    fail(report, `Marketplace entry "${PLUGIN_NAME}" is missing source.path.`, `Set source.path to the plugin path, for example "./plugins/${PLUGIN_NAME}".`);
    return;
  }

  const marketplaceRoot = codexConfig?.sections?.[`marketplaces.${LOCAL_MARKETPLACE}`]?.source;
  const resolvedPluginPath = resolveMarketplacePluginPath(source.path, marketplaceRoot, marketplaceFile);
  if (!existsSync(resolvedPluginPath)) {
    fail(report, `Marketplace source path does not exist: ${resolvedPluginPath}`, `Check source.path in ${marketplaceFile}.`);
    return;
  }

  const resolvedManifest = resolve(resolvedPluginPath, '.codex-plugin/plugin.json');
  if (!existsSync(resolvedManifest)) {
    fail(report, `Marketplace source path does not contain .codex-plugin/plugin.json: ${resolvedPluginPath}`, `Point source.path to this plugin root: ${pluginRoot}`);
    return;
  }
  pass(report, `Marketplace source path contains a plugin manifest`);

  const expectedRoot = realPathOrNull(pluginRoot);
  const actualRoot = realPathOrNull(resolvedPluginPath);
  if (!expectedRoot || !actualRoot || expectedRoot !== actualRoot) {
    fail(report, `Marketplace source path resolves to ${actualRoot || resolvedPluginPath}, expected ${expectedRoot || pluginRoot}.`, `Update source.path in ${marketplaceFile} so it points to this checkout.`);
    return;
  }
  pass(report, `Marketplace source path resolves to the current plugin root`);

  const expectedManifest = realPathOrNull(manifestPath);
  const actualManifest = realPathOrNull(resolvedManifest);
  if (expectedManifest && actualManifest && expectedManifest !== actualManifest) {
    warn(report, `Marketplace manifest path differs from current plugin manifest after resolution: ${actualManifest}`);
  }
}

function resolveMarketplacePluginPath(pluginPath, marketplaceRoot, marketplaceFile) {
  const expanded = expandHome(pluginPath);
  if (isAbsolutePath(expanded)) return resolve(expanded);
  if (typeof marketplaceRoot === 'string' && marketplaceRoot.trim()) {
    return resolve(expandHome(marketplaceRoot), expanded);
  }
  return resolve(dirname(marketplaceFile), expanded);
}

function parseDocumentedToml(text) {
  const sections = {};
  let currentSection = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripInlineComment(rawLine).trim();
    if (!line) continue;

    const sectionMatch = /^\[([^\]]+)]$/.exec(line);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      sections[currentSection] ||= {};
      continue;
    }

    if (!currentSection) continue;
    const keyMatch = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
    if (!keyMatch) continue;
    sections[currentSection][keyMatch[1]] = parseTomlScalar(keyMatch[2].trim());
  }

  return { sections };
}

function parseTomlScalar(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function stripInlineComment(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === '"' || char === "'") && line[index - 1] !== '\\') {
      quote = quote === char ? null : quote || char;
      continue;
    }
    if (char === '#' && !quote) return line.slice(0, index);
  }
  return line;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function realPathOrNull(path) {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

function resolvePath(path) {
  return resolve(expandHome(path));
}

function expandHome(path) {
  if (path === '~') return process.env.HOME || path;
  if (path.startsWith('~/')) return resolve(process.env.HOME || '', path.slice(2));
  return path;
}

function isAbsolutePath(path) {
  return path.startsWith('/');
}

function defaultPluginRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

function formatValue(value) {
  return value === undefined ? 'missing' : JSON.stringify(value);
}

function pass(report, message) {
  report.passes.push(message);
}

function warn(report, message) {
  report.warnings.push(message);
}

function fail(report, message, remediation) {
  report.failures.push({ message, remediation });
}

function printReport(report) {
  console.log('CX Orchestrator local setup check');
  console.log('');

  printGroup('PASS', report.passes);
  printGroup('WARN', report.warnings);
  printGroup('FAIL', report.failures.map((failure) => `${failure.message}\n  Fix: ${failure.remediation}`));

  console.log('');
  console.log(`Result: ${report.failures.length > 0 ? 'failed' : 'ok'}`);
}

function printGroup(label, items) {
  if (items.length === 0) return;
  console.log(`${label}:`);
  for (const item of items) {
    console.log(`  - ${item}`);
  }
  console.log('');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
