# Hook Migration Guide For MCP

This guide helps existing hook authors move from the original VS Code-centric context shape to the MCP-safe host abstraction.

## What Changes In MCP

In VS Code mode, hooks can still rely on the extension runtime. In MCP mode, the server runs in plain Node.js and only exposes a small compatibility layer for `require('vscode')`. File access, active document context, and glob lookups should move to `ctx.host`.

The safest rule is:

- use `ctx.host.*` for filesystem and workspace operations
- use `ctx.util.*` for helper functions such as Chinese matching and JSX / ICU parsing
- treat `require('vscode')` as a compatibility shim, not the primary API

## Old To New API Mapping

| Old style | MCP-safe style | Notes |
| --- | --- | --- |
| `ctx.vscode.workspace.fs.readFile(uri)` | `ctx.host.readFile(uri.fsPath)` | Returns UTF-8 text directly. |
| `ctx.vscode.workspace.fs.writeFile(uri, bytes)` | `ctx.host.writeFile(absPath, content)` | Writes must stay inside the workspace. |
| `ctx.vscode.workspace.findFiles(glob)` | `ctx.host.findFiles(glob)` | Returns absolute paths. |
| `ctx.document.getText()` | `ctx.host.getActiveContext()?.content` | MCP uses the caller-provided file snapshot. |
| `ctx.document.uri.fsPath` | `ctx.host.getActiveContext()?.filePath` | Use `ctx.active` or `ctx.host.getActiveContext()`. |
| `ctx.matchChinese(document)` | `ctx.util.matchChinese(active.content)` | Pass the active content string. |
| `ctx.isInJsxElement(...)` | `ctx.util.isInJsxElement(...)` | Helpers now live under `ctx.util`. |
| `ctx.getICUMessageFormatAST(...)` | `ctx.util.parseIcuMessage(...)` | Use the core ICU helpers. |

## Recommended Refactor Pattern

Before:

```js
const vscode = require('vscode');

module.exports = {
  async convert(ctx) {
    const document = ctx.document;
    const localeUri = vscode.Uri.file(`${document.uri.fsPath}.json`);
    const raw = await vscode.workspace.fs.readFile(localeUri);
    const active = document.getText();
    const groups = ctx.matchChinese(document);
    return groups.map((group) => ({ ...group, originalText: active.slice(group.range.start, group.range.end) }));
  }
};
```

After:

```js
module.exports = {
  async convert(ctx) {
    const active = ctx.host.getActiveContext();
    if (!active) {
      return [];
    }

    const localePath = `${ctx.host.workspaceRoot}/locales/zh.json`;
    const raw = await ctx.host.readFile(localePath);
    const locale = JSON.parse(raw);
    const groups = ctx.util.matchChinese(active.content);

    return groups.map((group) => ({
      ...group,
      originalText: locale[group.text] ?? group.text,
    }));
  },
};
```

## What `require('vscode')` Still Supports

The MCP runtime installs a lightweight shim so common data types continue to work:

- `vscode.Uri`
- `vscode.Range`
- `vscode.Position`
- `vscode.EventEmitter`
- `vscode.workspace.workspaceFolders`
- `vscode.workspace.fs.readFile`
- `vscode.workspace.fs.writeFile`
- `vscode.workspace.fs.stat`
- `vscode.workspace.findFiles`
- `vscode.workspace.getConfiguration()` for read access

These APIs are provided so existing hooks can migrate incrementally, but new hooks should prefer `ctx.host`.

## What Throws In MCP Mode

The following categories are intentionally blocked because they depend on the VS Code UI or editor process:

- `vscode.window.*`
- `vscode.env.clipboard.*`
- `vscode.commands.executeCommand` and `vscode.commands.registerCommand`
- `vscode.workspace.openTextDocument`
- `vscode.workspace.onDid*` event APIs
- `vscode.languages.*`

When a hook touches one of those APIs, the server throws `UNSUPPORTED_IN_MCP`.

Example payload:

```json
{
  "code": "UNSUPPORTED_IN_MCP",
  "message": "vscode.window.showQuickPick is not available in MCP mode. Use ctx.host.* instead.",
  "hook_location": {
    "file": "/absolute/path/.vscode/i18n-fast.hook.js",
    "line": 18
  }
}
```

Use that location to update the hook and replace the UI logic with deterministic input from the MCP client.

## Compatibility Behavior

The migration bridge keeps a few legacy behaviors to ease rollout:

- legacy hook exports (`match(ctx)`, `convert(ctx)`, `write(ctx)`, `collectI18n(ctx)`) still load
- `require('vscode')` resolves to the MCP shim inside hook code
- `ctx.active` is populated from the current MCP tool call
- `ctx.host.getActiveContext()` returns the same active snapshot and is the preferred long-term API

That bridge is intentionally narrow: it preserves file-oriented logic, not interactive UI behavior.

## Migration Checklist

1. Replace `workspace.fs.*` and `workspace.findFiles()` calls with `ctx.host` methods.
2. Replace direct document reads with `ctx.active` or `ctx.host.getActiveContext()`.
3. Move helper usage under `ctx.util`.
4. Remove `window.*`, clipboard, commands, and language-service dependencies from hooks that should run in MCP.
5. Keep all hook writes inside `ctx.host.workspaceRoot`.
6. Test the hook through both the VS Code extension and `dist/mcp-server.js`.

## When To Keep VS Code APIs

If a hook genuinely depends on editor UI, keep that behavior in VS Code mode only and guard it carefully. For cross-environment hooks, split the code path explicitly:

```js
if (ctx.host.mode === 'vscode') {
  // optional UI-only behavior
}
```

Everything needed by MCP should stay deterministic and file-based.
