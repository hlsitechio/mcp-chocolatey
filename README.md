# MCP Chocolatey

MCP server that exposes Chocolatey (choco) commands as tools.

- Transport: stdio (primary); simple HTTP /health for Railway
- Tools: list, search, install, upgrade, uninstall, info, outdated, pin, feature, source, config, help

## Usage (local)

```sh
# stdio
npx --yes --prefix G:\choco mcp-chocolatey
```

## Railway

This project binds to $PORT and exposes /health.
For remote MCP access use an SSE proxy (e.g. mcp-proxy) or run locally via stdio.

```sh
# Start web stub (Railway)
npm start
# Start stdio
npm run start:stdio
```

## License
MIT
