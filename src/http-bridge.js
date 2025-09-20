import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pExecFile = promisify(execFile);
const CHOCO_BIN = process.env.CHOCO_BIN || 'choco';
const DEFAULT_TIMEOUT_MS = Number(process.env.MCP_CHOCOLATEY_TIMEOUT_MS || '900000');
const MAX_CONCURRENCY = Math.max(1, Number(process.env.MCP_CHOCOLATEY_MAX_CONCURRENCY || '1'));

class Semaphore {
  constructor(permits) { this.permits = permits; this.queue = []; }
  async acquire() { if (this.permits > 0) { this.permits -= 1; return; } return new Promise(r => this.queue.push(r)); }
  release() { const n = this.queue.shift(); if (n) n(); else this.permits += 1; }
}
const sem = new Semaphore(MAX_CONCURRENCY);

async function runChoco(args, { timeoutMs } = {}) {
  await sem.acquire();
  try {
    const { stdout, stderr } = await pExecFile(CHOCO_BIN, args, { windowsHide: true, timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 });
    return { ok: true, exitCode: 0, stdout, stderr, rebootRequired: /3010|reboot required/i.test(stdout || '') };
  } catch (err) {
    const stdout = err?.stdout?.toString?.() ?? '';
    const stderr = err?.stderr?.toString?.() ?? String(err);
    const exitCode = typeof err?.code === 'number' ? err.code : 1;
    const rebootRequired = exitCode === 3010 || /3010|reboot required/i.test(stdout + '\n' + stderr);
    return { ok: false, exitCode, stdout, stderr, rebootRequired };
  } finally {
    sem.release();
  }
}

async function isAdmin() {
  if (process.platform !== 'win32') return false;
  try {
    const { stdout } = await pExecFile('powershell', [
      '-NoProfile','-NonInteractive','-Command',
      "[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"
    ], { windowsHide: true, timeout: 5000 });
    return /True/i.test(String(stdout).trim());
  } catch {
    return false;
  }
}

function logEvt(evt) {
  try { console.error(JSON.stringify({ ts: new Date().toISOString(), ...evt })); } catch (_) {}
}

function buildChocoServer() {
  const server = new McpServer({ name: 'mcp-chocolatey', version: '0.1.9' }, { capabilities: { logging: {} } });

  server.tool(
    'choco_list',
    'List installed (local) Chocolatey packages',
    z.object({ localOnly: z.boolean().default(true), exact: z.boolean().default(false), id: z.string().optional() }),
    async ({ localOnly, exact, id }) => {
      const args = ['list'];
      if (localOnly) args.push('-l');
      if (exact && id) args.push('--exact');
      if (id) args.push(id);
      const res = await runChoco(args);
      if (!res.ok) throw new Error(res.stderr || res.stdout);
      return { content: [{ type: 'text', text: res.stdout }] };
    }
  );

  server.tool(
    'choco_search',
    'Search remote Chocolatey packages',
    z.object({ query: z.string(), exact: z.boolean().default(false), prerelease: z.boolean().default(false) }),
    async ({ query, exact, prerelease }) => {
      const args = ['search', query];
      if (exact) args.push('--exact');
      if (prerelease) args.push('--pre');
      const res = await runChoco(args);
      if (!res.ok) throw new Error(res.stderr || res.stdout);
      return { content: [{ type: 'text', text: res.stdout }] };
    }
  );

  server.tool(
    'choco_install',
    'Install a Chocolatey package',
    z.object({
      id: z.string(),
      version: z.string().optional(),
      prerelease: z.boolean().default(false),
      force: z.boolean().default(false),
      source: z.string().optional(),
      yes: z.boolean().default(true),
      failOnStdErr: z.boolean().default(false),
      timeoutSec: z.number().int().positive().optional(),
      extraArgs: z.array(z.string()).default([]),
    }),
    async ({ id, version, prerelease, force, source, yes, failOnStdErr, timeoutSec, extraArgs }) => {
      if (!yes) throw new Error('Install requires yes=true');
      const admin = await isAdmin();
      const args = ['install', id];
      if (version) { args.push('--version', version); }
      if (prerelease) args.push('--pre');
      if (force) args.push('--force');
      if (source) args.push('-s', source);
      if (yes) args.push('-y');
      if (failOnStdErr) args.push('--fail-on-standard-error');
      if (Array.isArray(extraArgs) && extraArgs.length) args.push(...extraArgs);
      const t0 = Date.now();
      const res = await runChoco(args, { timeoutMs: timeoutSec ? timeoutSec * 1000 : undefined });
      logEvt({ tool: 'choco_install', id, durationMs: Date.now() - t0, exitCode: res.exitCode, ok: res.ok });
      if (!res.ok) throw new Error(res.stderr || res.stdout);
      const prefix = admin ? '' : '[Non-admin session] Some installs may fail or be user-scoped only.\n\n';
      return { content: [{ type: 'text', text: prefix + res.stdout }], annotations: { exitCode: String(res.exitCode), rebootRequired: String(res.rebootRequired) } };
    }
  );

  server.tool(
    'choco_upgrade',
    'Upgrade a Chocolatey package (or all with id=all)',
    z.object({
      id: z.string(),
      prerelease: z.boolean().default(false),
      force: z.boolean().default(false),
      source: z.string().optional(),
      yes: z.boolean().default(true),
      failOnStdErr: z.boolean().default(false),
      timeoutSec: z.number().int().positive().optional(),
      extraArgs: z.array(z.string()).default([]),
    }),
    async ({ id, prerelease, force, source, yes, failOnStdErr, timeoutSec, extraArgs }) => {
      if (!yes) throw new Error('Upgrade requires yes=true');
      const admin = await isAdmin();
      const args = ['upgrade', id];
      if (prerelease) args.push('--pre');
      if (force) args.push('--force');
      if (source) args.push('-s', source);
      if (yes) args.push('-y');
      if (failOnStdErr) args.push('--fail-on-standard-error');
      if (Array.isArray(extraArgs) && extraArgs.length) args.push(...extraArgs);
      const t0 = Date.now();
      const res = await runChoco(args, { timeoutMs: timeoutSec ? timeoutSec * 1000 : undefined });
      logEvt({ tool: 'choco_upgrade', id, durationMs: Date.now() - t0, exitCode: res.exitCode, ok: res.ok });
      if (!res.ok) throw new Error(res.stderr || res.stdout);
      const prefix = admin ? '' : '[Non-admin session] Some upgrades may fail or be user-scoped only.\n\n';
      return { content: [{ type: 'text', text: prefix + res.stdout }], annotations: { exitCode: String(res.exitCode), rebootRequired: String(res.rebootRequired) } };
    }
  );

  server.tool(
    'choco_uninstall',
    'Uninstall a Chocolatey package',
    z.object({
      id: z.string(),
      version: z.string().optional(),
      force: z.boolean().default(false),
      yes: z.boolean().default(true),
      timeoutSec: z.number().int().positive().optional(),
      extraArgs: z.array(z.string()).default([]),
    }),
    async ({ id, version, force, yes, timeoutSec, extraArgs }) => {
      if (!yes) throw new Error('Uninstall requires yes=true');
      const admin = await isAdmin();
      const args = ['uninstall', id];
      if (version) { args.push('--version', version); }
      if (force) args.push('--force');
      if (yes) args.push('-y');
      if (Array.isArray(extraArgs) && extraArgs.length) args.push(...extraArgs);
      const t0 = Date.now();
      const res = await runChoco(args, { timeoutMs: timeoutSec ? timeoutSec * 1000 : undefined });
      logEvt({ tool: 'choco_uninstall', id, durationMs: Date.now() - t0, exitCode: res.exitCode, ok: res.ok });
      if (!res.ok) throw new Error(res.stderr || res.stdout);
      const prefix = admin ? '' : '[Non-admin session] Some uninstalls may fail or be partial.\n\n';
      return { content: [{ type: 'text', text: prefix + res.stdout }], annotations: { exitCode: String(res.exitCode), rebootRequired: String(res.rebootRequired) } };
    }
  );

  server.tool(
    'choco_info',
    'Get package information',
    z.object({ id: z.string(), exact: z.boolean().default(true), verbose: z.boolean().default(false) }),
    async ({ id, exact, verbose }) => {
      const args = ['info', id];
      if (exact) args.push('--exact');
      if (verbose) args.push('--verbose');
      const res = await runChoco(args);
      if (!res.ok) throw new Error(res.stderr || res.stdout);
      return { content: [{ type: 'text', text: res.stdout }] };
    }
  );

  server.tool(
    'choco_outdated',
    'List outdated packages',
    z.object({ ignorePinned: z.boolean().default(false), includePrerelease: z.boolean().default(false) }),
    async ({ ignorePinned, includePrerelease }) => {
      const args = ['outdated'];
      if (ignorePinned) args.push('--ignore-pinned');
      if (includePrerelease) args.push('--pre');
      const res = await runChoco(args);
      if (!res.ok) throw new Error(res.stderr || res.stdout);
      return { content: [{ type: 'text', text: res.stdout }] };
    }
  );

  server.tool(
    'choco_pin',
    'Pin or list pins',
    z.object({ action: z.enum(['add','remove','list']).default('list'), id: z.string().optional() }),
    async ({ action, id }) => {
      const args = ['pin'];
      if (action === 'list') {
        args.push('list');
      } else if (action === 'add') {
        if (!id) throw new Error('id is required for add');
        args.push('add','-n', id);
      } else if (action === 'remove') {
        if (!id) throw new Error('id is required for remove');
        args.push('remove','-n', id);
      }
      const res = await runChoco(args);
      if (!res.ok) throw new Error(res.stderr || res.stdout);
      return { content: [{ type: 'text', text: res.stdout }] };
    }
  );

  server.tool(
    'choco_feature',
    'View or enable/disable features',
    z.object({ action: z.enum(['list','enable','disable']).default('list'), name: z.string().optional() }),
    async ({ action, name }) => {
      const args = ['feature'];
      if (action === 'list') {
        args.push('list');
      } else {
        if (!name) throw new Error('name is required for enable/disable');
        args.push(action, '-n', name);
      }
      const res = await runChoco(args);
      if (!res.ok) throw new Error(res.stderr || res.stdout);
      return { content: [{ type: 'text', text: res.stdout }] };
    }
  );

  server.tool(
    'choco_source',
    'List or manage sources',
    z.object({ action: z.enum(['list','add','remove','enable','disable','update']).default('list'), name: z.string().optional(), source: z.string().optional(), user: z.string().optional(), password: z.string().optional() }),
    async ({ action, name, source, user, password }) => {
      const args = ['source'];
      if (action === 'list') {
        args.push('list');
      } else if (action === 'add') {
        if (!name || !source) throw new Error('name and source are required for add');
        args.push('add','-n', name, '-s', source);
        if (user) { args.push('-u', user); }
        if (password) { args.push('-p', password); }
      } else {
        if (!name) throw new Error('name is required for this action');
        args.push(action, '-n', name);
      }
      const res = await runChoco(args);
      if (!res.ok) throw new Error(res.stderr || res.stdout);
      return { content: [{ type: 'text', text: res.stdout }] };
    }
  );

  server.tool(
    'choco_config',
    'Get or set Chocolatey config values',
    z.object({ action: z.enum(['get','set','unset','list']).default('list'), key: z.string().optional(), value: z.string().optional() }),
    async ({ action, key, value }) => {
      const args = ['config'];
      if (action === 'list') {
        args.push('list');
      } else if (action === 'get') {
        if (!key) throw new Error('key is required for get');
        args.push('get', key);
      } else if (action === 'set') {
        if (!key || value === undefined) throw new Error('key and value are required for set');
        args.push('set', key, value);
      } else if (action === 'unset') {
        if (!key) throw new Error('key is required for unset');
        args.push('unset', key);
      }
      const res = await runChoco(args);
      if (!res.ok) throw new Error(res.stderr || res.stdout);
      return { content: [{ type: 'text', text: res.stdout }] };
    }
  );

  server.tool(
    'choco_help',
    'Show Chocolatey help',
    z.object({ topic: z.string().optional() }),
    async ({ topic }) => {
      const args = ['-?'];
      if (topic) args.unshift(topic);
      const res = await runChoco(args);
      if (!res.ok) throw new Error(res.stderr || res.stdout);
      return { content: [{ type: 'text', text: res.stdout }] };
    }
  );

  return server;
}

const app = express();
app.use(express.json());
app.use(cors({ origin: '*', exposedHeaders: ['Mcp-Session-Id'] }));

app.post('/mcp', async (req, res) => {
  const server = buildChocoServer();
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('close', () => {
      transport.close();
      server.close();
    });
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: String(err) }, id: null });
    }
  }
});

app.get('/mcp', async (req, res) => {
  res.writeHead(405).end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }));
});

app.get('/health', (req, res) => {
  res.json({ ok: true, name: 'mcp-chocolatey', version: '0.1.9', ts: new Date().toISOString() });
});

const PORT = Number(process.env.PORT || 11435);
app.listen(PORT, (error) => {
  if (error) {
    console.error('Failed to start HTTP bridge:', error);
    process.exit(1);
  }
  console.error(`mcp-chocolatey HTTP bridge listening on http://127.0.0.1:${PORT}/mcp`);
});
