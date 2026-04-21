# i18n-fast MCP Server 设计文档

- **日期**：2026-04-21
- **分支**：`feature-mcp-server`
- **状态**：Draft，待审阅

## 1. 背景与目标

`vscode-i18n-fast` 是一个 Hook 驱动的 VS Code 国际化插件，核心能力是把硬编码文本转换为 i18n key、查询已有翻译、撤销写操作。当前所有能力都绑定 VS Code 编辑器环境。

本项目的目标：**在保留 VS Code 插件不变的前提下，从 repo 里再产出一个独立的 MCP server**，让 AI 编码代理（Claude Code / Cursor 等）能通过 MCP 协议调用以下两类能力：

1. **生成**：把硬编码中文转换为 i18n key，写入语言包文件，返回源码 patch 给 AI 应用
2. **查询**：反查 key 原文、查某段文本是否已有对应 key、按分页倾倒 i18n 索引

非目标（本期不做）：
- 项目级 i18n 体检报告
- 批量多语言翻译自动补全
- AI 自动生成 `.vscode/i18n-fast.hook.js`

## 2. 架构总览

继续单 repo、**目录分层**、不拆包、不发 npm。

```
vscode-i18n-fast/
├── src/
│   ├── core/                 ← 纯逻辑，禁止 import 'vscode'
│   │   ├── hook/             ← hook 加载、执行、生命周期
│   │   ├── i18n/             ← i18n 文件扫描、缓存
│   │   ├── convert/          ← match → convert 管道、冲突检测、diff 生成
│   │   ├── snapshot/         ← FileSnapshotStack
│   │   ├── text/             ← matchChinese、JSX 检测、ICU 相关
│   │   └── host.ts           ← Host 接口（第 3 节）
│   ├── vscode/               ← 原 src/ 大部分搬到这里
│   │   ├── extension.ts
│   │   ├── handler.ts
│   │   ├── provider.ts
│   │   └── vscodeHost.ts     ← 实现 Host，桥接 workspace.fs 等
│   └── mcp/                  ← 新增
│       ├── server.ts         ← stdio MCP server 入口
│       ├── fsHost.ts         ← 实现 Host，基于 node:fs + fast-glob
│       ├── vscodeShim.ts     ← 兼容 hook 中的 require('vscode')
│       └── tools/            ← 4 个 tool 的 handler
├── package.json              ← 同一个，声明两套入口
└── tsconfig.json             ← 用 path alias 强制分层
```

**依赖方向**（单向，靠 ESLint `no-restricted-imports` 守）：

```
vscode/ ──┐
          ├──> core/ ──> (无 vscode 依赖)
mcp/ ─────┘
```

**package.json 双入口**：

```jsonc
{
  "main": "./out/vscode/extension.js",
  "bin": { "i18n-fast-mcp": "./out/mcp/server.js" },
  "engines": { "vscode": "^1.102.0" }
}
```

**MCP 启动**：

```jsonc
{
  "i18n-fast": {
    "command": "node",
    "args": ["/abs/path/to/repo/out/mcp/server.js", "--workspace", "${workspaceFolder}"]
  }
}
```

一个 workspace 一个 server 进程。`--workspace` 不带时取 `process.cwd()`。

## 3. Host 接口

Host 是 core 与外部世界之间唯一的通道。VS Code 环境实现 `VsCodeHost`，MCP 环境实现 `FsHost`。

```ts
export interface Host {
  readonly mode: 'vscode' | 'mcp';
  readonly workspaceRoot: string;          // 绝对路径

  // —— 文件 I/O（core 和 hook 统一走这里，不准直接用 fs） ——
  readFile(absPath: string): Promise<string>;
  writeFile(absPath: string, content: string): Promise<void>;
  exists(absPath: string): Promise<boolean>;
  findFiles(include: string, exclude?: string): Promise<string[]>;

  // —— 变化监听 ——
  watch(glob: string, onChange: (absPath: string) => void): Disposable;

  // —— "当前焦点"上下文 ——
  getActiveContext(): ActiveContext | undefined;

  // —— 日志 ——
  log(level: 'debug' | 'info' | 'warn' | 'error', msg: string): void;
}

export interface ActiveContext {
  filePath: string;                                     // 绝对路径
  content: string;                                      // 文件当前内容
  selections?: Array<{ start: number; end: number }>;   // 字符偏移
  cursor?: number;
}
```

**关键设计**：

1. **路径用 string (绝对路径)**。VsCodeHost 入口转 Uri→string，出口反之。
2. **选区用字符偏移**。避免 CRLF / line-col 对齐 bug。
3. **`getActiveContext()` 是跨环境桥**：VsCodeHost 从 `window.activeTextEditor` 取；FsHost 从当前 tool 调用参数取。Hook 里一律写 `ctx.host.getActiveContext()`。
4. **Host 不含 UI 方法**。任何 QuickPick / showMessage / decoration 都不在接口里。

### Hook Context 新格式

```ts
export interface HookContext {
  host: Host;
  active?: ActiveContext;
  util: HookUtils;               // babel/pinyin/matchChinese/ICU/lodash/uuid/crypto-js/qs
  config: unknown;               // 用户自定义配置
}
```

### vscode shim（MCP 专用）

为了让已写好的 hook 零改动在 MCP 里跑，`src/mcp/vscodeShim.ts` 拦截 `require('vscode')`：

**提供**（桥到 Host / 纯数据）：

| API | 实现 |
|---|---|
| `Uri.file(path)`, `Uri.parse` | 返带 `fsPath`/`path`/`toString()` 的对象 |
| `Range`, `Position` | 纯数据类 |
| `workspace.workspaceFolders` | 从 `host.workspaceRoot` 合成 |
| `workspace.fs.readFile / writeFile / stat / readDirectory` | 桥到 `host.*` |
| `workspace.findFiles(glob, exclude)` | 桥到 `host.findFiles` |
| `workspace.getConfiguration(section)` | 只读 config 透传 |
| `workspace.asRelativePath` | 纯路径运算 |
| `EventEmitter`（类本身） | 允许 |

**抛 `UnsupportedInMcpError`**：

- `window.*`（所有）
- `commands.executeCommand` / `commands.registerCommand`
- `workspace.openTextDocument`、`TextDocument` 实例
- `workspace.onDid*` 事件族
- `env.clipboard`
- `languages.*`

错误消息附带 hook 文件路径和调用行号（从 Error.stack 解析）。

## 4. MCP Tools 契约

### 4.1 `convert_text`

生成 key、写语言包、返源码 patch。

**入参**：

```jsonc
{
  "files": [
    {
      "path": "/abs/path/src/FooBar.vue",
      "content": "<template>...</template>",          // AI 刚读到的全文
      "selections": [{ "start": 120, "end": 135 }]    // 可选；不传=整文件扫描中文
    }
  ],
  "conflict_policy": "smart",                         // 覆盖 settings 默认
  "picker_resolutions": { "<group-id>": "reuse:I18N.foo" }  // 上轮 picker 的答案
}
```

`conflict_policy` 取值（沿用原插件语义）：

- `reuse`：检测到相同原文时复用现有 key，不新建
- `ignore`：忽略已存在的，始终新建一个 key
- `picker`：交给用户选（MCP 下退化为第 6.6 节的两轮交互）
- `smart`：精确命中相同原文 → `reuse`；近似命中多条 → `picker`；否则新建

**出参**：

```jsonc
{
  "source_patches": [
    { "path": "/abs/...", "unified_diff": "--- a/...\n+++ b/..." }
  ],
  "i18n_writes_applied": [
    { "path": "/abs/locales/zh.json", "bytes_changed": 42 }
  ],
  "undo_token": "snap_01HQK...",
  "conflicts": [ /* 仅 picker 策略未决时出现 */ ]
}
```

### 4.2 `query_i18n`

反查原文 / 正查已有 key。

```jsonc
// 入参（任选其一或组合）
{ "keys": ["I18N.foo.bar"], "text": "添加用户", "locale": "zh" }

// 出参
{
  "hits": [{ "key": "I18N.foo.bar", "locale": "zh", "text": "...", "file": "..." }],
  "misses": ["I18N.does.not.exist"]
}
```

### 4.3 `list_i18n_entries`

倾倒 i18n 索引（强制分页）。

```jsonc
{ "locale": "zh", "limit": 200, "offset": 0 }
→ { "entries": [...], "total": 3217 }
```

### 4.4 `undo`

按 token 回滚；不传则回退最近一次。

```jsonc
{ "undo_token": "snap_01HQK..." } → { "reverted_files": ["/abs/..."] }
```

### 4.5 错误模型（结构化 JSON-RPC error.data）

| code | 场景 | AI 恢复路径 |
|---|---|---|
| `HOOK_NOT_FOUND` | 项目没 `.vscode/i18n-fast.hook.js` | 向用户报错，引导配置 |
| `HOOK_LOAD_ERROR` | hook 语法错 / require 失败 | 把 stack 给用户 |
| `HOOK_TIMEOUT` | hook 某一步 >30s | 向用户报 hook 性能问题 |
| `UNSUPPORTED_IN_MCP` | hook 调了 UI API | 指明被调的具体 API 和 hook 行号 |
| `CONFLICT_NEEDS_RESOLUTION` | `picker` 策略未决 | 读 `conflicts` 重调 `convert_text` 带 `picker_resolutions` |
| `CONTENT_DRIFT` | 入参 `content` 与磁盘不一致 | 重读文件再调 |
| `PATH_OUTSIDE_WORKSPACE` | hook 想写工作区外路径 | 拒写；提示 |

## 5. 数据流

一次 `convert_text` 调用：

```
AI → convert_text({files, selections})
      │
      ▼
FsHost.getActiveContext ←←← 从 tool 参数构造，不读磁盘
      │
      ▼
core.hookManager.match(active)           ── 用户 hook
      │
      ▼
core.hookManager.convert(groups)         ── 拿到 {key, replacement}
      │
      ▼
core.conflictDetector                    ── 查 i18n 缓存；picker 未决 → 直接返 conflicts，流程停在这一步
      │
      ▼
snapshotStack.push(所有将被改的 i18n 文件的当前内容)
      │
      ▼
core.hookManager.write(groups)           ── hook 走 host.writeFile 落盘 i18n
      │
      ▼
core.diffBuilder                         ── 源码只算 unified diff，不写盘
      │
      ▼
返回 {source_patches, i18n_writes_applied, undo_token}
```

### 两个不变量

1. **源码从不被 MCP 直写**，只返 patch，由 AI 的 Edit 工具落盘。
2. **i18n 文件由 MCP 直写 + snapshot**。`undo_token` 跨 tool 调用有效，存在进程内存，重启即失效；退路是 `git restore`。

## 6. 运行时细节

### 6.1 Hook 隔离

- **不用 vm sandbox**，直接 `require`（非对抗性假设；对齐现有 VS Code 插件行为）。
- **每次 hook 调用独立超时**：`match` / `convert` / `write` / `collectI18n` 各 30s 超时，超时抛 `HOOK_TIMEOUT`，不杀进程。
- **延迟加载**：MCP 进程启动时不加载 hook；首次使用 tool 时加载；`host.watch('.vscode/i18n-fast.hook.js')` 触发热重载（清 `require.cache` 后重 require）。

### 6.2 i18n 缓存

- 首次 `query_i18n` / `list_i18n_entries` / `convert_text` 时扫描
- `host.watch(i18nFilePattern)` 触发增量刷新

### 6.3 并发

MCP stdio 天然单客户端串行。唯一并发来源：MCP 正在处理请求时，用户在 VS Code 或其他进程改了磁盘。应对：

- `convert_text` 入参 `content` = AI 刚读到的快照
- Server 在 `hook.match` 之前做 `host.readFile(path) !== params.content` 比对
- 不一致 → `CONTENT_DRIFT`，AI 重读重调

### 6.4 undo_token 生命周期

- 存在进程内存的 `FileSnapshotStack`，MAX_SIZE = 10
- 进程重启 token 失效
- 不持久化、不跨 session

### 6.5 路径安全

`FsHost.writeFile` 内置守卫：

```ts
const rel = path.relative(this.workspaceRoot, absPath);
if (rel.startsWith('..') || path.isAbsolute(rel)) {
  throw new PathOutsideWorkspaceError(absPath);
}
```

不防 hook 里 `require('fs')` 直接绕 Host（非对抗假设）。

### 6.6 picker 冲突的两轮交互

原插件的 `picker` 策略需要 QuickPick。在 MCP 下退化为两轮：

1. 第一轮：`convert_text` 返 `conflicts: [{group_id, options: [...]}, ...]` + `CONFLICT_NEEDS_RESOLUTION` 错误
2. 第二轮：AI 带 `picker_resolutions: { "<group-id>": "reuse:<key>" | "new:<key>" }` 重调

## 7. 测试策略

| 层 | 工具 | 对象 | 重点 |
|---|---|---|---|
| Core 单元 | vitest | `snapshot/`、`text/`、`convert/conflictDetector`、`convert/diffBuilder` | 纯函数；FileSnapshotStack 的 push/pop/MAX_SIZE 边界 |
| Hook 引擎 | vitest + fixture hook | `core/hook/` 对一组 fixture hook 跑 match/convert/write/collectI18n | 超时、热重载、require 错误、UnsupportedInMcpError |
| MCP 契约 | `@modelcontextprotocol/sdk` client + `child_process.spawn` | `mcp/server.ts` 真跑 stdio | 4 个 tool 的入参 schema、出参结构、错误 code、CONTENT_DRIFT、picker 两轮 |
| VS Code 回归 | `@vscode/test-electron` | `vscode/extension.ts` 抽包后的插件 | convert / paste / undo 在真 VS Code 行为不变 |

**端到端 fixture**：`tests/e2e/fixtures/vue-project/` 放一个小 Vue 项目（带 `.vscode/i18n-fast.hook.js`、`locales/zh.json`），MCP client 跑完整 convert → query → undo，断言 locale 文件变化和源码 patch。

**不测**：vscode shim 与真 VS Code API 的字节级对齐；hook 恶意 `require('fs')` 绕过 Host（非对抗假设）。

## 8. 分阶段落地

每个 Phase 结束 VS Code 插件都能正常发版。

### Phase 0 — 基建（~0.5 天）

- 建 `src/core/` `src/vscode/` `src/mcp/` 目录
- tsconfig paths + ESLint `no-restricted-imports` 禁 `src/core/` 导入 `vscode`
- 把现有 `src/*.ts` 原样挪进 `src/vscode/`，`package.json` `main` 指向新路径
- **验证**：VS Code 插件编译通过、3 个命令手动冒烟

### Phase 1 — 零依赖逻辑下沉（~1 天）

- `FileSnapshotStack` → `src/core/snapshot/`
- `matchChinese` / JSX 检测 / ICU 相关 → `src/core/text/`
- **验证**：core 单测绿；插件功能不变

### Phase 2 — Host 接口定型（~2 天）

- 写 `src/core/host.ts` 接口
- 写 `src/vscode/vscodeHost.ts`（桥 `workspace.fs` 等）
- `handler.ts` / 原 `utils.ts` 里所有直接 I/O 改走 `Host`
- **验证**：插件回归测试

### Phase 3 — Hook 引擎入 core（~3 天，最难）

- `src/core/hook/` 接管加载、执行、热重载、超时
- Hook context 新格式 `{ host, active, util, config }`
- 旧 hook 通过 VsCodeHost 注入 `vscode` 保持兼容
- Fixture hook 单测
- **验证**：插件的 convert/paste 端到端未破

### Phase 4 — MCP 骨架 + 第一个 tool（~2 天）

- `src/mcp/fsHost.ts`（`node:fs` + `fast-glob` + `chokidar`）
- `src/mcp/vscodeShim.ts`（第 3 节的 API 清单）
- `src/mcp/server.ts` stdio 入口，先只挂 `query_i18n`
- 第一条 MCP 契约测试
- **验证**：手工在 Claude Code 里 `@i18n-fast query_i18n` 能查到原文

### Phase 5 — `convert_text` 全链路（~3 天）

- 接 snapshot、conflict、picker 两轮交互、CONTENT_DRIFT 检测、unified diff 生成
- 端到端 fixture 跑通
- **验证**：Claude Code 里让 AI 把 fixture 项目一段中文转成 key，diff apply + locale 文件对账

### Phase 6 — `list_i18n_entries` + `undo` + 打磨（~1 天）

- 补齐剩 2 个 tool
- vscode shim 的 UnsupportedInMcpError 错误信息打磨（带 hook 文件行号）
- README / MCP 配置示例 / hook 迁移指南

### Phase 7 — 发布（~0.5 天）

- VS Code 插件 0.1.0 发 marketplace + open-vsx
- README 教用户本地 `node out/mcp/server.js` 起 MCP；留将来发 npm 的口子

**总预估：~13 天实际工作**。Phase 2 → 3 的顺序不能换（Host 必须先于 hook 引擎）。

## 9. 仓库里的预期改动

- **破坏性改动**：`src/handler.ts`（拆成 `vscode/handler.ts` + `core/convert/pipeline.ts`）、`src/utils.ts`（按职责拆 4 份到 core）、`src/hook.ts`（`core/hook/`）
- **几乎不动**：`src/localize.ts`、`src/provider.ts`、`src/config.ts`
- **新文件**：`src/core/host.ts`、`src/mcp/` 全树、`tests/` 重构、`docs/mcp/` 迁移指南

## 10. 开放问题 / 未决

目前无未决项，所有关键分叉在 brainstorming 阶段已锁定。若实施期发现新问题，单独补充到本文件底部或新开 ADR。
