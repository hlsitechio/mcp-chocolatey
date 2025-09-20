<p align="center">
  <img src="./assets/choco_mcp_logo.png" width="320" alt="MCP Chocolatey logo"/>
</p>

<h1 align="center">MCP Chocolatey</h1>
<p align="center">Chocolatey on the Model Context Protocol — searchable, installable, upgradable via tools.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/mcp-chocolatey"><img src="https://img.shields.io/npm/v/mcp-chocolatey.svg?logo=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/mcp-chocolatey"><img src="https://img.shields.io/npm/dw/mcp-chocolatey.svg" alt="downloads/week"></a>
  <img src="https://img.shields.io/npm/l/mcp-chocolatey.svg" alt="license">
  <img src="https://img.shields.io/node/v/mcp-chocolatey.svg" alt="node >=18">
</p>

---

## 🚀 Quick start (Claude Desktop)

Add this entry to `claude_desktop_config.json` (Windows path: `C:\Users\<you>\AppData\Roaming\Claude\claude_desktop_config.json`).

```json
{
  "mcpServers": {
    "chocolatey": {
      "command": "npx",
      "args": ["-y", "mcp-chocolatey"],
      "env": {
        "NPX_SILENT": "1",
        "npm_config_loglevel": "silent"
      }
    }
  }
}
```

Restart Claude Desktop. Then try:
- "List installed Chocolatey packages" (uses `choco_list`)
- "Search for 7zip on Chocolatey" (uses `choco_search`)
- "Check outdated Chocolatey packages" (uses `choco_outdated`)

> 💡 **Tip**: If your environment chatters on `npx`, you can run Node directly:  
> `command: "node"`, `args: ["C:\Users\<you>\AppData\Roaming\npm\node_modules\mcp-chocolatey\src\server.js"]`.

---

## ✨ What you get

- ⚡ Fully typed MCP tools backed by Chocolatey CLI
- 🔧 Zero configuration — uses your existing `choco` install
- 🖥️ Works in standard Windows terminals and Claude Desktop

### 🛠️ Tools implemented
- `choco_list` — list local packages (`-l`)
- `choco_search` — search remote packages (supports `--exact`, `--pre`)
- `choco_install` — install by id (optional `--version`, `-y`)
- `choco_upgrade` — upgrade by id or `all`
- `choco_uninstall` — uninstall by id
- `choco_info` — package info (`--exact`, `--verbose`)
- `choco_outdated` — list outdated packages
- `choco_pin` — add/remove/list pins
- `choco_feature` — list/enable/disable features
- `choco_source` — list/add/remove/enable/disable/update sources
- `choco_config` — list/get/set/unset config values
- `choco_help` — passthrough help

---

## 🔧 Troubleshooting

### "Unexpected token … not valid JSON" in Claude logs
Any non‑JSON text on stdout can break MCP. This package avoids stdout noise; however, some environments make `npx` chatty. **Fix**: add the env shown above (`NPX_SILENT`, `npm_config_loglevel`) or run `node` directly to the server script.

### `choco` not found
Ensure Chocolatey is on PATH. For a per‑user install it typically lives under `C:\Users\<you>\AppData\Local\UniGetUI\Chocolatey\bin`.

---

## 🏗️ Local development

```sh
# Start in stdio mode (stdout must be clean for MCP)
npm run start:stdio
```

---

## 📄 License
MIT
