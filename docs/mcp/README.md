# MCP Server Guide

`vscode-i18n-fast` now ships an MCP server so AI agents can reuse the same hook-driven i18n workflow outside VS Code. The server runs over stdio and exposes four tools: `query_i18n`, `convert_text`, `list_i18n_entries`, and `undo`.

## Prerequisites

Before connecting an MCP client, make sure the target workspace already contains:

- `.vscode/settings.json` with `i18n-fast.hookFilePattern` and `i18n-fast.i18nFilePattern`
- a hook file such as `.vscode/i18n-fast.hook.js`
- the locale files that your hook reads and writes

The MCP server does not replace project configuration; it reuses the same project-level hook and i18n setup that the VS Code extension uses.

## Build From Source

From this repository root:

```bash
pnpm install
pnpm run build:mcp
```

The build outputs `dist/mcp-server.js`.

You can smoke-test the server manually:

```bash
node dist/mcp-server.js --workspace /absolute/path/to/your/project
```

## Register In Claude Code / Cursor

Most MCP clients accept the same `command` + `args` shape. The exact config file location depends on the client version, but the server entry itself can look like this:

```json
{
  "mcpServers": {
    "i18n-fast": {
      "command": "node",
      "args": [
        "/absolute/path/to/vscode-i18n-fast/dist/mcp-server.js",
        "--workspace",
        "${workspaceFolder}"
      ]
    }
  }
}
```

A copy of that payload is also provided in [`docs/mcp/claude-code-config-example.json`](./claude-code-config-example.json).

Tips:

- In Claude Code, add the server to your MCP config and point `--workspace` at the repo the agent is editing.
- In Cursor, paste the same JSON into MCP server settings and update the absolute `dist/mcp-server.js` path.
- Rebuild `dist/mcp-server.js` after changing MCP source files.

## Tool Reference

All tool responses are returned as JSON text in the first MCP content item.

### `query_i18n`

Look up existing i18n entries by key, text, or both.

Request:

```json
{
  "keys": ["I18N.user.add"],
  "text": "添加用户",
  "locale": "zh"
}
```

Response:

```json
{
  "hits": [
    {
      "key": "I18N.user.add",
      "locale": "zh",
      "text": "添加用户",
      "file": "/absolute/path/locales/zh.json"
    }
  ],
  "misses": []
}
```

### `convert_text`

Convert hard-coded text in a file, write locale changes immediately, and return a unified diff for the source file.

Request:

```json
{
  "files": [
    {
      "path": "/absolute/path/src/FooBar.vue",
      "content": "<template>添加用户</template>"
    }
  ],
  "conflict_policy": "smart"
}
```

Successful response:

```json
{
  "source_patches": [
    {
      "path": "/absolute/path/src/FooBar.vue",
      "unified_diff": "--- a/src/FooBar.vue\n+++ b/src/FooBar.vue\n..."
    }
  ],
  "i18n_writes_applied": [
    {
      "path": "/absolute/path/locales/zh.json",
      "bytes_changed": 42
    }
  ],
  "undo_token": "snap_01HQK..."
}
```

Picker-flow error response:

```json
{
  "code": "CONFLICT_NEEDS_RESOLUTION",
  "message": "conflict needs picker resolution",
  "conflicts": [
    {
      "group_id": "g0",
      "options": [
        { "label": "reuse:I18N.user.add", "key": "I18N.user.add" }
      ]
    }
  ]
}
```

Retry the same `convert_text` call with `picker_resolutions`, for example:

```json
{
  "files": [
    {
      "path": "/absolute/path/src/FooBar.vue",
      "content": "<template>添加用户</template>"
    }
  ],
  "conflict_policy": "picker",
  "picker_resolutions": {
    "g0": "reuse:I18N.user.add"
  }
}
```

### `list_i18n_entries`

Dump the in-memory i18n index with pagination.

Request:

```json
{
  "locale": "zh",
  "limit": 200,
  "offset": 0
}
```

Response:

```json
{
  "entries": [
    {
      "key": "I18N.user.add",
      "locale": "zh",
      "text": "添加用户",
      "filePath": "/absolute/path/locales/zh.json"
    }
  ],
  "total": 1
}
```

### `undo`

Revert locale file writes recorded during a previous `convert_text` call.

Request:

```json
{
  "undo_token": "snap_01HQK..."
}
```

Response:

```json
{
  "reverted_files": [
    "/absolute/path/locales/zh.json"
  ]
}
```

If `undo_token` is omitted, the server reverts the most recent snapshot.

## Error Codes

| Code | Meaning | Typical fix |
| --- | --- | --- |
| `HOOK_NOT_FOUND` | The configured hook file does not exist in the workspace. | Create the hook file or fix `i18n-fast.hookFilePattern`. |
| `HOOK_TIMEOUT` | A hook step exceeded the execution timeout. | Optimize the hook or reduce expensive network / file work. |
| `UNSUPPORTED_IN_MCP` | The hook called a VS Code UI-only API in MCP mode. | Replace it with `ctx.host.*` / `ctx.util.*`; inspect `hook_location` in the error payload. |
| `CONFLICT_NEEDS_RESOLUTION` | `convert_text` needs picker answers before it can continue. | Read `conflicts`, collect the choice, and retry with `picker_resolutions`. |
| `CONTENT_DRIFT` | The provided `files[].content` no longer matches the file on disk. | Re-read the file, then call `convert_text` again with fresh content. |
| `PATH_OUTSIDE_WORKSPACE` | A hook tried to write outside the current workspace. | Keep hook reads/writes inside the workspace root. |
| `INTERNAL` | Unexpected server error. | Check stderr / stack trace and fix the hook or project config. |

`UNSUPPORTED_IN_MCP` errors include the blocked API name in `message`, and when possible also include:

```json
{
  "hook_location": {
    "file": "/absolute/path/.vscode/i18n-fast.hook.js",
    "line": 23
  }
}
```

## Workflow Notes

- `convert_text` currently expects exactly one file per call.
- The locale file writes happen during the tool call; the source file is not auto-written by the server. Apply the returned diff on the client side.
- `undo_token` is process-local. Restarting the MCP server clears the undo stack.
- Locale files are rescanned when tools load the i18n index; restart the MCP server after editing the hook file itself.

## Related Docs

- Migration guide: [`docs/mcp/migration.md`](./migration.md)
- Example config: [`docs/mcp/claude-code-config-example.json`](./claude-code-config-example.json)
- Design / implementation plan: [`docs/superpowers/plans/2026-04-21-mcp-server.md`](../superpowers/plans/2026-04-21-mcp-server.md)
