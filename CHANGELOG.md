# Change Log

## 0.1.0 (2026-04-21)

- feat(mcp): ship an MCP stdio server with `query_i18n`, `convert_text`, `list_i18n_entries`, and `undo`
- feat(core): extract reusable host, hook, i18n cache, convert pipeline, diff, and snapshot layers for VS Code + MCP
- test: add MCP contract coverage, unsupported API errors, and full convert -> query -> undo e2e flow

## 0.0.12 (2025-05-31)

- refactor: add onChange method to Hook,I18n [#31](https://github.com/lvboda/vscode-i18n-fast/pull/31)
- refactor(watcher): use chokidar@3.6.0 [#30](https://github.com/lvboda/vscode-i18n-fast/pull/30)
