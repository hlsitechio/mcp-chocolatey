import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { createServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pExecFile = promisify(execFile);

async function runChoco(args) {
  try {
    const { stdout, stderr } = await pExecFile('choco', args, { windowsHide: true });
    return { ok: true, stdout, stderr };
  } catch (err) {
    const stdout = err?.stdout?.toString?.() ?? '';
    const stderr = err?.stderr?.toString?.() ?? String(err);
    return { ok: false, stdout, stderr };
  }
}

function buildChocoServer() {
  const server = createServer({ name: 'mcp-chocolatey', version: '0.1.0' });

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
    z.object({ query: z.string(), exact: z.boolean().default(false), pre: z.boolean().default(false) }),
    async ({ query, exact, pre }) => {
      const args = ['search', query];
      if (exact) args.push('--exact');
      if (pre) args.push('--pre');
      const res = await runChoco(args);
      if (!res.ok) throw new Error(res.stderr || res.stdout);
      return { content: [{ type: 'text', text: res.stdout }] };
    }
  );

  server.tool(
    'choco_install',
    'Install a Chocolatey package',
    z.object({ id: z.string(), version: z.string().optional(), y: z.boolean().default(true), params: z.array(z.string()).default([]) }),
    async ({ id, version, y, params }) => {
      const args = ['install', id];
      if (version) { args.push('--version'); args.push(version); }
      if (y) args.push('-y');
      args.push(...params);
      const res = await runChoco(args);
      if (!res.ok) throw new Error(res.stderr || res.stdout);
      return { content: [{ type: 'text', text: res.stdout }] };
    }
  );

  server.tool(
    'choco_upgrade',
    'Upgrade a Chocolatey package (or all with id=all)',
    z.object({ id: z.string(), y: z.boolean().default(true), params: z.array(z.string()).default([]) }),
    async ({ id, y, params }) => {
      const args = ['upgrade', id];
      if (y) args.push('-y');
      args.push(...params);
      const res = await runChoco(args);
      if (!res.ok) throw new Error(res.stderr || res.stdout);
      return { content: [{ type: 'text', text: res.stdout }] };
    }
  );

  server.tool(
    'choco_uninstall',
    'Uninstall a Chocolatey package',
    z.object({ id: z.string(), y: z.boolean().default(true), params: z.array(z.string()).default([]) }),
    async ({ id, y, params }) => {
      const args = ['uninstall', id];
      if (y) args.push('-y');
      args.push(...params);
      const res = await runChoco(args);
      if (!res.ok) throw new Error(res.stderr || res.stdout);
      return { content: [{ type: 'text', text: res.stdout }] };
    }
  );

  server.tool(
    'choco_info',
    'Get package information',
    z.object({ id: z.string(), exact: z.boolean().default(true), verbose: z.boolean().default(true) }),
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
    z.object({ ignorePinned: z.boolean().default(false) }),
    async ({ ignorePinned }) => {
      const args = ['outdated'];
      if (ignorePinned) args.push('--ignore-pinned');
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

const PORT = Number(process.env.PORT || 11435);
app.listen(PORT, (error) => {
  if (error) {
    console.error('Failed to start HTTP bridge:', error);
    process.exit(1);
  }
  console.error(`mcp-chocolatey HTTP bridge listening on http://127.0.0.1:${PORT}/mcp`);
});