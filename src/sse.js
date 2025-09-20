import { spawn } from 'node:child_process';
import http from 'node:http';

// Minimal SSE bridge for MCP stdio server.
// This is a very simple passthrough for demonstration and may need
// enhancements for production-grade MCP SSE semantics.

const port = process.env.PORT ? Number(process.env.PORT) : 8080;
const host = '0.0.0.0';

// Spawn the stdio MCP server
const child = spawn(process.execPath, ['src/server.js'], { stdio: ['pipe','pipe','pipe'] });
child.on('exit', (code) => {
  console.error('stdio MCP child exited', code);
  process.exit(code ?? 1);
});

// Very naive SSE endpoint just to keep Railway happy with a port.
// Real MCP SSE requires full event routing; consider using mcp-proxy.
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('MCP Chocolatey server is running. Use stdio transport for now.');
});

server.listen(port, host, () => {
  console.error(`HTTP server listening on http://${host}:${port}`);
});
