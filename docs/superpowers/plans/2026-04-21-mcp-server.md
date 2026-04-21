# i18n-fast MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留 VS Code 插件不变的前提下，从 repo 里再产出一个独立的 MCP server，让 AI 编码代理（Claude Code / Cursor 等）能调用 i18n-fast 的 Hook 驱动 i18n 转换与查询能力。

**Architecture:** 单 repo 目录分层（`src/core` + `src/vscode` + `src/mcp`）。`core` 零 VS Code 依赖，通过 `Host` 接口抽象 I/O；`vscode` 和 `mcp` 各自实现 `Host` 并消费 `core`。Hook 在 MCP 下通过 `vscode` shim 拦截 `require('vscode')` 保持兼容。

**Tech Stack:** TypeScript 5.7, webpack 5, vitest (新增), `@modelcontextprotocol/sdk` (新增), `fast-glob` (新增), `chokidar` (已有), `@babel/parser`, `@formatjs/icu-messageformat-parser`, `@monyone/aho-corasick`, `tiny-pinyin`, `lodash`。

---

## Reference

- **Spec:** `docs/superpowers/specs/2026-04-21-mcp-server-design.md`
- **Branch:** `feature-mcp-server`
- **Current src structure:** `src/{extension,handler,hook,i18n,provider,utils,config,constant,error,tips,watcher,localize,types/*}.ts`

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `src/core/host.ts` | `Host` / `ActiveContext` / `Disposable` 接口定义 |
| `src/core/types.ts` | core 通用类型（`ConvertGroup` / `I18nEntry` / `HookContext` 等） |
| `src/core/snapshot/fileSnapshotStack.ts` | 从 `utils.ts` 抽出的 `FileSnapshotStack` |
| `src/core/text/matchChinese.ts` | 从 `utils.ts` 抽出的中文匹配 |
| `src/core/text/jsx.ts` | 从 `utils.ts` 抽出的 JSX 检测 |
| `src/core/text/icu.ts` | 从 `utils.ts` 抽出的 ICU 解析 |
| `src/core/hook/loader.ts` | Hook 文件加载 + `require.cache` 管理 |
| `src/core/hook/context.ts` | `HookContext` 构造器 |
| `src/core/hook/manager.ts` | HookManager：生命周期 + 超时 + 热重载 |
| `src/core/i18n/scanner.ts` | i18n 文件扫描 |
| `src/core/i18n/cache.ts` | i18n 缓存（内存） |
| `src/core/convert/pipeline.ts` | match → convert → write 管道 |
| `src/core/convert/conflictDetector.ts` | 冲突检测（reuse/ignore/picker/smart） |
| `src/core/convert/diffBuilder.ts` | unified diff 生成 |
| `src/vscode/vscodeHost.ts` | VsCodeHost：用 `workspace.fs` / `findFiles` / `activeTextEditor` 实现 Host |
| `src/mcp/server.ts` | stdio MCP server 入口（`#!/usr/bin/env node`） |
| `src/mcp/fsHost.ts` | FsHost：用 `node:fs` + `fast-glob` + `chokidar` 实现 Host |
| `src/mcp/vscodeShim.ts` | 注册 Node require hook，拦截 `require('vscode')` |
| `src/mcp/activeContextStore.ts` | MCP 下 `host.getActiveContext()` 的来源（每轮 tool 调用塞入） |
| `src/mcp/tools/convertText.ts` | `convert_text` tool handler |
| `src/mcp/tools/queryI18n.ts` | `query_i18n` tool handler |
| `src/mcp/tools/listI18nEntries.ts` | `list_i18n_entries` tool handler |
| `src/mcp/tools/undo.ts` | `undo` tool handler |
| `src/mcp/errors.ts` | 结构化错误类：`HookNotFoundError` / `UnsupportedInMcpError` / `ContentDriftError` 等 |
| `vitest.config.ts` | vitest 配置 |
| `tests/core/**.test.ts` | core 单测 |
| `tests/mcp/**.test.ts` | MCP 契约测试 |
| `tests/e2e/fixtures/vue-project/` | 端到端 fixture（带 `.vscode/i18n-fast.hook.js`） |
| `webpack.mcp.config.js` | MCP server 独立 webpack 入口 |

### Files moved

| From | To |
|---|---|
| `src/extension.ts` | `src/vscode/extension.ts` |
| `src/handler.ts` | `src/vscode/handler.ts` |
| `src/provider.ts` | `src/vscode/provider.ts` |
| `src/hook.ts` | `src/vscode/hookBridge.ts`（保留单例桥，实际逻辑委托给 `core/hook/manager.ts`） |
| `src/i18n.ts` | `src/vscode/i18nBridge.ts`（同上） |
| `src/config.ts` | `src/vscode/config.ts`（VS Code 配置读取，保持） |
| `src/watcher.ts` | `src/vscode/watcher.ts` |
| `src/tips.ts` | `src/vscode/tips.ts` |
| `src/constant.ts` | `src/vscode/constant.ts` |
| `src/error.ts` | `src/vscode/error.ts` |
| `src/localize.ts` | `src/vscode/localize.ts` |
| `src/types/` | `src/vscode/types/`（VS Code 专属类型） + 迁移通用部分到 `src/core/types.ts` |
| `src/utils.ts` | **拆分**：纯逻辑部分进 `core/snapshot/`, `core/text/`；VS Code 相关进 `src/vscode/utils.ts` |

### Files modified (in place)

| Path | 改动 |
|---|---|
| `package.json` | 加 `bin`、加 scripts (`test`, `build:mcp`)、加 dev deps (`vitest`, `@modelcontextprotocol/sdk`, `fast-glob`, `@vitest/coverage-v8`) |
| `tsconfig.json` | 加 `paths`、保持 `rootDir: src` |
| `.eslintrc.json` | 加 `no-restricted-imports` 规则禁 `src/core/` 导入 `vscode` |
| `webpack.config.js` | `entry: './src/vscode/extension.ts'`（原 `./src/extension.ts`） |

---

## Tasks

### Task 1: 基建（目录 + tsconfig paths + ESLint 边界）

**Files:**
- Create: `src/core/.gitkeep`, `src/vscode/.gitkeep`, `src/mcp/.gitkeep`
- Modify: `tsconfig.json`, `.eslintrc.json`

- [ ] **Step 1: 建目录骨架**

```bash
mkdir -p src/core/{snapshot,text,hook,i18n,convert} src/vscode src/mcp/tools
touch src/core/.gitkeep src/vscode/.gitkeep src/mcp/.gitkeep
```

- [ ] **Step 2: 更新 tsconfig.json**

完整替换内容为：

```json
{
  "compilerOptions": {
    "module": "Node16",
    "target": "ES2022",
    "lib": ["ES2022"],
    "sourceMap": true,
    "rootDir": "src",
    "strict": true,
    "baseUrl": "./src",
    "paths": {
      "@core/*": ["core/*"],
      "@vscode-ext/*": ["vscode/*"],
      "@mcp/*": ["mcp/*"]
    }
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: 更新 .eslintrc.json 禁止 core 引用 vscode**

完整替换内容为：

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": { "ecmaVersion": 6, "sourceType": "module" },
  "plugins": ["@typescript-eslint"],
  "rules": {
    "@typescript-eslint/semi": "warn",
    "eqeqeq": "warn",
    "no-throw-literal": "warn",
    "semi": "off"
  },
  "overrides": [
    {
      "files": ["src/core/**/*.ts"],
      "rules": {
        "no-restricted-imports": ["error", {
          "paths": [{
            "name": "vscode",
            "message": "src/core/ 禁止依赖 vscode；通过 Host 接口获取能力"
          }]
        }]
      }
    }
  ],
  "ignorePatterns": ["out", "dist", "**/*.d.ts", "tests/**"]
}
```

- [ ] **Step 4: 验证编译**

```bash
pnpm run compile
```
Expected: 成功产出 `dist/extension.js`，无错误。

- [ ] **Step 5: Commit**

```bash
git add src/core/.gitkeep src/vscode/.gitkeep src/mcp/.gitkeep tsconfig.json .eslintrc.json
git commit -m "chore: scaffold core/vscode/mcp directories and enforce layering"
```

---

### Task 2: 挪现有 src/*.ts 到 src/vscode/

**Files:**
- Move: `src/extension.ts` `src/handler.ts` `src/provider.ts` `src/hook.ts` `src/i18n.ts` `src/config.ts` `src/constant.ts` `src/error.ts` `src/localize.ts` `src/tips.ts` `src/watcher.ts` `src/utils.ts` `src/types/` → `src/vscode/`
- Modify: `webpack.config.js`, `package.json`

- [ ] **Step 1: 用 git mv 搬文件（保留 history）**

```bash
git mv src/extension.ts src/handler.ts src/provider.ts src/hook.ts src/i18n.ts \
       src/config.ts src/constant.ts src/error.ts src/localize.ts src/tips.ts \
       src/watcher.ts src/utils.ts src/vscode/
git mv src/types src/vscode/types
```

- [ ] **Step 2: 修 webpack.config.js 的 entry**

将 `entry: './src/extension.ts'` 改为 `entry: './src/vscode/extension.ts'`。

- [ ] **Step 3: 修 package.json 的 main**

将 `"main": "./dist/extension.js"` 保持不变（webpack 输出文件名不变），但确认 lint script `eslint src --ext ts` 仍覆盖新目录（会自动，因为 `src` 递归）。

- [ ] **Step 4: 验证编译**

```bash
pnpm run compile
```
Expected: 成功。所有 import 都是相对路径，挪动整个目录时内部相对引用保持有效。

- [ ] **Step 5: 手动冒烟 VS Code 插件**

在 VS Code Extension Development Host 里打开 `example/`，执行 `Cmd+Alt+C` 看 convert 是否仍能工作。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move existing src/*.ts into src/vscode/"
```

---

### Task 3: 新增 vitest 测试基建

**Files:**
- Create: `vitest.config.ts`, `tests/.gitkeep`
- Modify: `package.json`, `.eslintrc.json`

- [ ] **Step 1: 安装 dev deps**

```bash
pnpm add -D vitest @vitest/coverage-v8
```

- [ ] **Step 2: 写 vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@mcp': path.resolve(__dirname, 'src/mcp')
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/fixtures/**'],
    coverage: { provider: 'v8', include: ['src/core/**', 'src/mcp/**'] }
  }
});
```

- [ ] **Step 3: 往 package.json scripts 加测试命令**

在 `"scripts"` 块追加：

```jsonc
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 4: 写一个 sanity test**

Create `tests/sanity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('vitest works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: 运行测试**

```bash
pnpm run test
```
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts tests/sanity.test.ts
git commit -m "chore: add vitest for core/mcp unit tests"
```

---

### Task 4: 抽 FileSnapshotStack 到 core/snapshot/

**Files:**
- Read: `src/vscode/utils.ts`（定位 `FileSnapshotStack` 类）
- Create: `src/core/snapshot/fileSnapshotStack.ts`, `tests/core/snapshot.test.ts`
- Modify: `src/vscode/utils.ts`, 所有引用 `FileSnapshotStack` 的 vscode 文件

- [ ] **Step 1: 读 FileSnapshotStack 现状**

打开 `src/vscode/utils.ts`，找到 `class FileSnapshotStack`（参考 spec 第 5 节：旧行号 L329-387）。识别它依赖的 VS Code API（若有）。

- [ ] **Step 2: 写测试**

Create `tests/core/snapshot.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { FileSnapshotStack } from '@core/snapshot/fileSnapshotStack';

describe('FileSnapshotStack', () => {
  let stack: FileSnapshotStack;

  beforeEach(() => {
    stack = new FileSnapshotStack({ maxSize: 3 });
  });

  it('push 一次产生一个 token，pop 能取回原内容', () => {
    stack.next();
    stack.record('/abs/a.json', 'before-a');
    const token = stack.seal();
    expect(token).toMatch(/^snap_/);

    const reverted = stack.undo(token);
    expect(reverted).toEqual([{ path: '/abs/a.json', content: 'before-a' }]);
  });

  it('超过 maxSize 时最旧的快照被丢弃', () => {
    for (let i = 0; i < 4; i++) {
      stack.next();
      stack.record(`/abs/${i}.json`, `v${i}`);
      stack.seal();
    }
    expect(stack.size()).toBe(3);
  });

  it('undo 未知 token 返 undefined', () => {
    expect(stack.undo('snap_nonexistent')).toBeUndefined();
  });

  it('同一个快照内多次 record 同一路径只留最早值', () => {
    stack.next();
    stack.record('/abs/a.json', 'v1');
    stack.record('/abs/a.json', 'v2');
    const token = stack.seal();
    expect(stack.undo(token)).toEqual([{ path: '/abs/a.json', content: 'v1' }]);
  });
});
```

- [ ] **Step 3: 运行测试，确认失败**

```bash
pnpm run test tests/core/snapshot.test.ts
```
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现 FileSnapshotStack**

Create `src/core/snapshot/fileSnapshotStack.ts`:

```ts
import { randomUUID } from 'node:crypto';

export interface SnapshotRecord {
  path: string;
  content: string;
}

export interface FileSnapshotStackOptions {
  maxSize?: number;
}

interface Frame {
  token: string;
  records: Map<string, string>;
}

export class FileSnapshotStack {
  private readonly maxSize: number;
  private frames: Frame[] = [];
  private current: Frame | null = null;

  constructor(opts: FileSnapshotStackOptions = {}) {
    this.maxSize = opts.maxSize ?? 10;
  }

  next(): void {
    this.current = { token: `snap_${randomUUID()}`, records: new Map() };
  }

  record(path: string, beforeContent: string): void {
    if (!this.current) {
      throw new Error('FileSnapshotStack.record called before next()');
    }
    if (!this.current.records.has(path)) {
      this.current.records.set(path, beforeContent);
    }
  }

  seal(): string {
    if (!this.current) {
      throw new Error('FileSnapshotStack.seal called before next()');
    }
    const frame = this.current;
    this.current = null;
    this.frames.push(frame);
    while (this.frames.length > this.maxSize) this.frames.shift();
    return frame.token;
  }

  undo(token?: string): SnapshotRecord[] | undefined {
    const idx = token
      ? this.frames.findIndex((f) => f.token === token)
      : this.frames.length - 1;
    if (idx < 0) return undefined;
    const [frame] = this.frames.splice(idx, 1);
    return Array.from(frame.records, ([path, content]) => ({ path, content }));
  }

  size(): number {
    return this.frames.length;
  }

  clear(): void {
    this.frames = [];
    this.current = null;
  }
}
```

- [ ] **Step 5: 运行测试，确认通过**

```bash
pnpm run test tests/core/snapshot.test.ts
```
Expected: 4 passed.

- [ ] **Step 6: 替换 src/vscode/utils.ts 里的旧 FileSnapshotStack**

从 `src/vscode/utils.ts` 删除 `class FileSnapshotStack`，改为：

```ts
export { FileSnapshotStack } from '@core/snapshot/fileSnapshotStack';
```

如果旧类的 API（方法名、单例模式）与新的不同，**同时**在该文件里写一个薄适配层保留旧签名，不直接改所有调用点（避免 Task 过大，后续 Task 会逐个迁调用点）。例如旧代码是单例 `FileSnapshotStack.getInstance()`：

```ts
import { FileSnapshotStack as CoreStack } from '@core/snapshot/fileSnapshotStack';

let singleton: CoreStack | null = null;
export class FileSnapshotStack {
  static getInstance(): CoreStack {
    if (!singleton) singleton = new CoreStack();
    return singleton;
  }
}
```

若旧 API 与新不同（旧的 `push/pop` vs 新的 `next/record/seal/undo`），在这一步暴露两套方法并桥接：

```ts
// 在适配层里提供旧方法名
```

具体桥接请根据 `src/vscode/utils.ts` 现存代码补齐，目标是**编译通过**。

- [ ] **Step 7: 编译 + 跑测试 + 冒烟 VS Code**

```bash
pnpm run compile && pnpm run test
```
手动在 Extension Development Host 里 Cmd+Alt+C → Cmd+Alt+B 走一轮 convert+undo。

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(core): extract FileSnapshotStack with unit tests"
```

---

### Task 5: 抽 matchChinese 到 core/text/matchChinese.ts

**Files:**
- Read: `src/vscode/utils.ts`（L85-173 的 `matchChinese`）
- Create: `src/core/text/matchChinese.ts`, `tests/core/matchChinese.test.ts`
- Modify: `src/vscode/utils.ts`（export 转发）

- [ ] **Step 1: 读现有 matchChinese，识别签名和依赖**

`matchChinese` 应该是 `(text: string, options?: {...}) => Array<{start, end, text}>`。确认它是否依赖 vscode 的 `Range`/`Position`——如果是，在 core 版本里改成字符偏移 `{start, end}`。

- [ ] **Step 2: 写测试**

Create `tests/core/matchChinese.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { matchChinese } from '@core/text/matchChinese';

describe('matchChinese', () => {
  it('抓取简单中文片段', () => {
    const hits = matchChinese('hello 添加用户 world');
    expect(hits).toHaveLength(1);
    expect(hits[0].text).toBe('添加用户');
    expect(hits[0].start).toBe(6);
    expect(hits[0].end).toBe(10);
  });

  it('忽略单行注释里的中文', () => {
    const hits = matchChinese('// 这是注释\nconst x = "真中文";');
    expect(hits.map((h) => h.text)).toEqual(['真中文']);
  });

  it('忽略多行注释里的中文', () => {
    const hits = matchChinese('/* 注释 */ "保留"');
    expect(hits.map((h) => h.text)).toEqual(['保留']);
  });

  it('保留标点穿插的中文短语', () => {
    const hits = matchChinese('"请输入，名称！"');
    expect(hits[0].text).toBe('请输入，名称！');
  });

  it('空字符串返空数组', () => {
    expect(matchChinese('')).toEqual([]);
  });
});
```

- [ ] **Step 3: 跑测试，确认失败**

```bash
pnpm run test tests/core/matchChinese.test.ts
```
Expected: FAIL。

- [ ] **Step 4: 从 src/vscode/utils.ts 复制 matchChinese 到 core**

Create `src/core/text/matchChinese.ts`。从旧 utils.ts 里把 `matchChinese` 和它依赖的辅助函数（去注释、字符类判断等）完整搬过来。**改动点**：任何 `import ... from 'vscode'` 必须移除；返回结构改为 `{ start: number; end: number; text: string }`。

导出签名：

```ts
export interface ChineseHit {
  start: number;
  end: number;
  text: string;
}

export interface MatchChineseOptions {
  // 保留与 utils.ts 原有 options 兼容
}

export function matchChinese(text: string, options?: MatchChineseOptions): ChineseHit[] {
  // 移植逻辑
}
```

- [ ] **Step 5: 跑测试，确认通过**

```bash
pnpm run test tests/core/matchChinese.test.ts
```
Expected: 5 passed. 若某个 case 不通过，调整实现对齐行为。

- [ ] **Step 6: src/vscode/utils.ts 改为 re-export**

从 utils.ts 删除原 `matchChinese` 实现，在文件末尾追加：

```ts
export { matchChinese } from '@core/text/matchChinese';
```

若 vscode 里调用 `matchChinese` 期望 `Range`/`Position` 返回，写一个 `src/vscode/textUtils.ts` 做映射，保留 vscode 调用点零改动。

- [ ] **Step 7: 编译、跑测试、冒烟**

```bash
pnpm run compile && pnpm run test
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(core): extract matchChinese with unit tests"
```

---

### Task 6: 抽 JSX 检测到 core/text/jsx.ts

**Files:**
- Read: `src/vscode/utils.ts`（L221-327 的 `isInJsxElement` 及相关）
- Create: `src/core/text/jsx.ts`, `tests/core/jsx.test.ts`
- Modify: `src/vscode/utils.ts`

- [ ] **Step 1: 写测试**

Create `tests/core/jsx.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isInJsxElement } from '@core/text/jsx';

describe('isInJsxElement', () => {
  it('JSX 元素内的文本返回 true', () => {
    const src = 'const x = <div>添加用户</div>;';
    const offset = src.indexOf('添加用户');
    expect(isInJsxElement(src, offset)).toBe(true);
  });

  it('字符串字面量里的中文返回 false', () => {
    const src = 'const x = "添加用户";';
    const offset = src.indexOf('添加用户');
    expect(isInJsxElement(src, offset)).toBe(false);
  });

  it('JSX attribute 值内返 false（由 AST 区分）', () => {
    const src = 'const x = <div title="提示">x</div>;';
    const offset = src.indexOf('提示');
    expect(isInJsxElement(src, offset)).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm run test tests/core/jsx.test.ts
```
Expected: FAIL。

- [ ] **Step 3: 实现**

Create `src/core/text/jsx.ts`，把 `isInJsxElement` 从 utils.ts 搬过来，依赖 `@babel/parser` + `@babel/traverse`。移除任何 vscode 引用。

```ts
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

export function isInJsxElement(source: string, offset: number): boolean {
  // 用 @babel/parser 解析（带 jsx + typescript plugins），走 traverse 判断 offset 落入 JSXElement.children
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm run test tests/core/jsx.test.ts
```
Expected: 3 passed.

- [ ] **Step 5: utils.ts 改为 re-export，commit**

```ts
export { isInJsxElement } from '@core/text/jsx';
```

```bash
pnpm run compile && git add -A && git commit -m "refactor(core): extract JSX detection with unit tests"
```

---

### Task 7: 抽 ICU 解析到 core/text/icu.ts

**Files:**
- Create: `src/core/text/icu.ts`, `tests/core/icu.test.ts`
- Modify: `src/vscode/utils.ts`

- [ ] **Step 1: 写测试**

Create `tests/core/icu.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseIcuMessage, extractIcuPlaceholders } from '@core/text/icu';

describe('ICU', () => {
  it('抽取简单占位符', () => {
    expect(extractIcuPlaceholders('Hello {name}')).toEqual(['name']);
  });

  it('复数占位符', () => {
    expect(extractIcuPlaceholders('{count, plural, one {# item} other {# items}}'))
      .toContain('count');
  });

  it('解析无效 ICU 抛错', () => {
    expect(() => parseIcuMessage('Hello {')).toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm run test tests/core/icu.test.ts
```
Expected: FAIL。

- [ ] **Step 3: 实现**

Create `src/core/text/icu.ts`:

```ts
import { parse } from '@formatjs/icu-messageformat-parser';
import type { MessageFormatElement } from '@formatjs/icu-messageformat-parser';

export function parseIcuMessage(input: string): MessageFormatElement[] {
  return parse(input);
}

export function extractIcuPlaceholders(input: string): string[] {
  const ast = parseIcuMessage(input);
  const names = new Set<string>();
  const walk = (nodes: MessageFormatElement[]) => {
    for (const node of nodes) {
      if ('value' in node && typeof (node as any).value === 'string' && node.type !== 0) {
        names.add((node as any).value);
      }
      if ('options' in node) {
        for (const opt of Object.values((node as any).options)) {
          walk((opt as any).value);
        }
      }
    }
  };
  walk(ast);
  return Array.from(names);
}
```

- [ ] **Step 4: 跑测试**

Expected: 3 passed.

- [ ] **Step 5: utils.ts re-export + commit**

```bash
git add -A && git commit -m "refactor(core): extract ICU parsing with unit tests"
```

---

### Task 8: 定义 Host 接口 + core/types.ts

**Files:**
- Create: `src/core/host.ts`, `src/core/types.ts`

- [ ] **Step 1: 写 types.ts**

Create `src/core/types.ts`:

```ts
export interface ConvertGroup {
  id: string;
  filePath: string;
  range: { start: number; end: number };
  originalText: string;
  key?: string;
  replacementText?: string;
  matched?: { keyIfReuse?: string; candidates?: Array<{ key: string; text: string }> };
}

export interface I18nEntry {
  key: string;
  text: string;
  locale: string;
  filePath: string;
  line?: number;
}

export type ConflictPolicy = 'reuse' | 'ignore' | 'picker' | 'smart';

export interface ResolvedConfig {
  hookFilePattern: string;
  i18nFilePattern: string;
  conflictPolicy: ConflictPolicy;
  autoMatchChinese: boolean;
  [key: string]: unknown;
}
```

- [ ] **Step 2: 写 host.ts**

Create `src/core/host.ts`:

```ts
export type HostMode = 'vscode' | 'mcp';

export interface ActiveContext {
  filePath: string;
  content: string;
  selections?: Array<{ start: number; end: number }>;
  cursor?: number;
}

export interface Disposable {
  dispose(): void;
}

export interface Host {
  readonly mode: HostMode;
  readonly workspaceRoot: string;

  readFile(absPath: string): Promise<string>;
  writeFile(absPath: string, content: string): Promise<void>;
  exists(absPath: string): Promise<boolean>;
  findFiles(include: string, exclude?: string): Promise<string[]>;

  watch(glob: string, onChange: (absPath: string) => void): Disposable;

  getActiveContext(): ActiveContext | undefined;

  log(level: 'debug' | 'info' | 'warn' | 'error', msg: string): void;
}
```

- [ ] **Step 3: 写 Host 合约级测试（可选但推荐）**

Create `tests/core/host.test.ts`：测试一个 in-memory fake host 能满足 Host 接口（编译期检查 + 最小 behavior 合约）：

```ts
import { describe, it, expect } from 'vitest';
import type { Host, ActiveContext, Disposable } from '@core/host';

function createFakeHost(): Host {
  const files = new Map<string, string>();
  return {
    mode: 'mcp',
    workspaceRoot: '/work',
    async readFile(p) { if (!files.has(p)) throw new Error('ENOENT'); return files.get(p)!; },
    async writeFile(p, c) { files.set(p, c); },
    async exists(p) { return files.has(p); },
    async findFiles() { return Array.from(files.keys()); },
    watch(): Disposable { return { dispose() {} }; },
    getActiveContext(): ActiveContext | undefined { return undefined; },
    log() {}
  };
}

describe('Host', () => {
  it('fake host 能 roundtrip 写读', async () => {
    const h = createFakeHost();
    await h.writeFile('/work/a.json', '{"x":1}');
    expect(await h.readFile('/work/a.json')).toBe('{"x":1}');
    expect(await h.exists('/work/a.json')).toBe(true);
  });
});
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm run test && git add -A && git commit -m "feat(core): define Host interface and core types"
```

---

### Task 9: 实现 VsCodeHost

**Files:**
- Create: `src/vscode/vscodeHost.ts`
- Modify: `src/vscode/extension.ts`（改用 VsCodeHost 实例）

- [ ] **Step 1: 写实现**

Create `src/vscode/vscodeHost.ts`:

```ts
import { workspace, window, Uri, RelativePattern } from 'vscode';
import type { Host, ActiveContext, Disposable } from '@core/host';

export class VsCodeHost implements Host {
  readonly mode = 'vscode' as const;
  readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  async readFile(absPath: string): Promise<string> {
    const bytes = await workspace.fs.readFile(Uri.file(absPath));
    return Buffer.from(bytes).toString('utf-8');
  }

  async writeFile(absPath: string, content: string): Promise<void> {
    await workspace.fs.writeFile(Uri.file(absPath), Buffer.from(content, 'utf-8'));
  }

  async exists(absPath: string): Promise<boolean> {
    try {
      await workspace.fs.stat(Uri.file(absPath));
      return true;
    } catch {
      return false;
    }
  }

  async findFiles(include: string, exclude?: string): Promise<string[]> {
    const folder = workspace.workspaceFolders?.[0];
    if (!folder) return [];
    const pattern = new RelativePattern(folder, include);
    const uris = await workspace.findFiles(pattern, exclude);
    return uris.map((u) => u.fsPath);
  }

  watch(glob: string, onChange: (absPath: string) => void): Disposable {
    const folder = workspace.workspaceFolders?.[0];
    if (!folder) return { dispose() {} };
    const pattern = new RelativePattern(folder, glob);
    const watcher = workspace.createFileSystemWatcher(pattern);
    const d1 = watcher.onDidChange((u) => onChange(u.fsPath));
    const d2 = watcher.onDidCreate((u) => onChange(u.fsPath));
    const d3 = watcher.onDidDelete((u) => onChange(u.fsPath));
    return { dispose() { d1.dispose(); d2.dispose(); d3.dispose(); watcher.dispose(); } };
  }

  getActiveContext(): ActiveContext | undefined {
    const editor = window.activeTextEditor;
    if (!editor) return undefined;
    const doc = editor.document;
    const content = doc.getText();
    const selections = editor.selections.map((s) => ({
      start: doc.offsetAt(s.start),
      end: doc.offsetAt(s.end)
    }));
    return {
      filePath: doc.uri.fsPath,
      content,
      selections,
      cursor: doc.offsetAt(editor.selection.active)
    };
  }

  log(level: 'debug' | 'info' | 'warn' | 'error', msg: string): void {
    console[level === 'debug' ? 'log' : level](msg);
  }
}
```

- [ ] **Step 2: 编译**

```bash
pnpm run compile
```
Expected: 成功。

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(vscode): implement VsCodeHost"
```

---

### Task 10: 把 handler.ts / utils.ts 里的 I/O 改走 VsCodeHost

**Files:**
- Modify: `src/vscode/extension.ts`（构造 VsCodeHost 注入）、`src/vscode/handler.ts`、`src/vscode/hook.ts`、`src/vscode/i18n.ts`

**注意**：**只改 I/O（读/写/扫描文件）调用点**，不碰 hook/i18n/convert 的 core 化。core 化是 Task 11+。

- [ ] **Step 1: 在 extension.ts 构造 Host 并注入单例**

在 `activate` 函数里：

```ts
import { VsCodeHost } from './vscodeHost';

const workspaceRoot = workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
const host = new VsCodeHost(workspaceRoot);
Hook.getInstance().setHost(host);
I18n.getInstance().setHost(host);
FileSnapshotStack.getInstance();  // 已是单例，不需 host
```

- [ ] **Step 2: 在 Hook 类、I18n 类上加 setHost / getHost**

```ts
private host?: Host;
setHost(h: Host) { this.host = h; }
private get h(): Host { if (!this.host) throw new Error('Host not set'); return this.host; }
```

- [ ] **Step 3: 把 Hook / I18n / handler 里的 `workspace.fs.readFile` / `workspace.findFiles` / `workspace.fs.writeFile` 改走 `this.h.readFile` 等**

逐处 grep 替换：

```bash
grep -rn "workspace.fs\|workspace.findFiles\|fs.readFile\|fs.writeFile" src/vscode/ | grep -v vscodeHost.ts
```

每一处都替换成 `host.readFile` / `host.writeFile` / `host.findFiles`。**不碰**  `src/vscode/vscodeHost.ts` 自己。

- [ ] **Step 4: 编译 + 冒烟**

```bash
pnpm run compile
```
在 Extension Development Host 跑 convert 命令，验证行为不变。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(vscode): route Hook/I18n/handler I/O through Host"
```

---

### Task 11: Hook loader + HookContext 抽到 core/hook/

**Files:**
- Create: `src/core/hook/loader.ts`, `src/core/hook/context.ts`, `src/core/hook/manager.ts`, `src/core/hook/types.ts`, `tests/core/hook-manager.test.ts`, `tests/core/fixtures/hooks/basic.js`
- Modify: `src/vscode/hook.ts`（改为薄桥，委托给 HookManager）

- [ ] **Step 1: 写 core/hook/types.ts**

```ts
import type { Host, ActiveContext } from '../host';
import type { ConvertGroup, I18nEntry } from '../types';

export interface HookUtils {
  matchChinese: typeof import('../text/matchChinese').matchChinese;
  isInJsxElement: typeof import('../text/jsx').isInJsxElement;
  parseIcuMessage: typeof import('../text/icu').parseIcuMessage;
  extractIcuPlaceholders: typeof import('../text/icu').extractIcuPlaceholders;
  // 透传：lodash/uuid/crypto-js/pinyin/qs/babel —— MCP shim 和 VsCode 都提供
  [key: string]: unknown;
}

export interface HookContext {
  host: Host;
  active?: ActiveContext;
  util: HookUtils;
  config: unknown;
}

export interface HookModule {
  match?(ctx: HookContext): Promise<ConvertGroup[]> | ConvertGroup[];
  convert?(groups: ConvertGroup[], ctx: HookContext): Promise<ConvertGroup[]> | ConvertGroup[];
  write?(groups: ConvertGroup[], ctx: HookContext): Promise<void> | void;
  collectI18n?(content: string, filePath: string, ctx: HookContext): Promise<I18nEntry[]> | I18nEntry[];
  matchI18n?(key: string, ctx: HookContext): boolean;
}
```

- [ ] **Step 2: 写 core/hook/loader.ts**

```ts
import { createRequire } from 'node:module';
import type { HookModule } from './types';

export interface LoadResult {
  module: HookModule;
  filePath: string;
}

export class HookLoader {
  private readonly nodeRequire: NodeRequire;

  constructor(anchorFile: string) {
    this.nodeRequire = createRequire(anchorFile);
  }

  load(absPath: string): LoadResult {
    delete this.nodeRequire.cache[this.nodeRequire.resolve(absPath)];
    const mod = this.nodeRequire(absPath) as HookModule;
    return { module: mod, filePath: absPath };
  }
}
```

- [ ] **Step 3: 写 core/hook/context.ts**

```ts
import type { Host } from '../host';
import type { HookContext, HookUtils } from './types';
import { matchChinese } from '../text/matchChinese';
import { isInJsxElement } from '../text/jsx';
import { parseIcuMessage, extractIcuPlaceholders } from '../text/icu';

export function createUtils(extras: Record<string, unknown> = {}): HookUtils {
  return {
    matchChinese,
    isInJsxElement,
    parseIcuMessage,
    extractIcuPlaceholders,
    ...extras
  };
}

export function createHookContext(params: {
  host: Host;
  utilExtras?: Record<string, unknown>;
  config: unknown;
}): HookContext {
  return {
    host: params.host,
    active: params.host.getActiveContext(),
    util: createUtils(params.utilExtras),
    config: params.config
  };
}
```

- [ ] **Step 4: 写 core/hook/manager.ts（带超时）**

```ts
import type { Host } from '../host';
import type { ConvertGroup, I18nEntry } from '../types';
import type { HookContext, HookModule } from './types';
import { HookLoader } from './loader';
import { createHookContext } from './context';

export class HookTimeoutError extends Error {
  constructor(public readonly phase: string) {
    super(`Hook ${phase} timed out after 30s`);
  }
}

const TIMEOUT_MS = 30_000;

async function withTimeout<T>(phase: string, p: Promise<T> | T): Promise<T> {
  return await Promise.race([
    Promise.resolve(p),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new HookTimeoutError(phase)), TIMEOUT_MS)
    )
  ]);
}

export class HookManager {
  private loaded?: { module: HookModule; filePath: string };

  constructor(
    private readonly host: Host,
    private readonly loader: HookLoader,
    private readonly getConfig: () => unknown
  ) {}

  async reload(absPath: string): Promise<void> {
    this.loaded = this.loader.load(absPath);
  }

  private buildCtx(): HookContext {
    return createHookContext({ host: this.host, config: this.getConfig() });
  }

  async match(): Promise<ConvertGroup[]> {
    if (!this.loaded?.module.match) return [];
    return withTimeout('match', this.loaded.module.match(this.buildCtx()));
  }

  async convert(groups: ConvertGroup[]): Promise<ConvertGroup[]> {
    if (!this.loaded?.module.convert) return groups;
    return withTimeout('convert', this.loaded.module.convert(groups, this.buildCtx()));
  }

  async write(groups: ConvertGroup[]): Promise<void> {
    if (!this.loaded?.module.write) return;
    await withTimeout('write', this.loaded.module.write(groups, this.buildCtx()));
  }

  async collectI18n(content: string, filePath: string): Promise<I18nEntry[]> {
    if (!this.loaded?.module.collectI18n) return [];
    return withTimeout('collectI18n', this.loaded.module.collectI18n(content, filePath, this.buildCtx()));
  }

  isLoaded(): boolean {
    return !!this.loaded;
  }
}
```

- [ ] **Step 5: 写 fixture hook**

Create `tests/core/fixtures/hooks/basic.js`:

```js
module.exports = {
  match(ctx) {
    const hits = ctx.util.matchChinese(ctx.active?.content ?? '');
    return hits.map((h, i) => ({
      id: `g${i}`,
      filePath: ctx.active.filePath,
      range: { start: h.start, end: h.end },
      originalText: h.text
    }));
  },
  convert(groups) {
    return groups.map((g) => ({ ...g, key: `I18N.auto.${g.id}`, replacementText: `t('I18N.auto.${g.id}')` }));
  },
  async write(groups, ctx) {
    const locale = ctx.host.workspaceRoot + '/locales/zh.json';
    let existing = {};
    if (await ctx.host.exists(locale)) {
      existing = JSON.parse(await ctx.host.readFile(locale));
    }
    for (const g of groups) existing[g.key] = g.originalText;
    await ctx.host.writeFile(locale, JSON.stringify(existing, null, 2));
  },
  collectI18n(content, filePath) {
    try {
      const j = JSON.parse(content);
      const locale = (filePath.match(/([a-z]+)\.json$/) || [])[1] || 'zh';
      return Object.entries(j).map(([key, text]) => ({ key, text, locale, filePath }));
    } catch {
      return [];
    }
  }
};
```

- [ ] **Step 6: 写 hook manager 测试**

Create `tests/core/hook-manager.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { HookLoader } from '@core/hook/loader';
import { HookManager, HookTimeoutError } from '@core/hook/manager';
import type { Host } from '@core/host';

function makeHost(active?: { filePath: string; content: string }): Host {
  const files = new Map<string, string>();
  return {
    mode: 'mcp',
    workspaceRoot: '/work',
    async readFile(p) { return files.get(p) ?? ''; },
    async writeFile(p, c) { files.set(p, c); },
    async exists(p) { return files.has(p); },
    async findFiles() { return []; },
    watch() { return { dispose() {} }; },
    getActiveContext() { return active; },
    log() {}
  };
}

describe('HookManager', () => {
  const fixturePath = path.resolve(__dirname, 'fixtures/hooks/basic.js');

  it('match/convert/write 端到端', async () => {
    const host = makeHost({ filePath: '/work/a.ts', content: '添加用户' });
    const loader = new HookLoader(__filename);
    const mgr = new HookManager(host, loader, () => ({}));
    await mgr.reload(fixturePath);

    const matched = await mgr.match();
    expect(matched[0].originalText).toBe('添加用户');

    const converted = await mgr.convert(matched);
    expect(converted[0].key).toMatch(/^I18N\./);

    await mgr.write(converted);
    expect(await host.readFile('/tmp/fake-locale.json')).toContain('添加用户');
  });

  it('超时的 hook 阶段抛 HookTimeoutError', async () => {
    const slowHookPath = path.resolve(__dirname, 'fixtures/hooks/slow.js');
    // 在 slow.js 里导出 match 返回 new Promise(() => {})
    const host = makeHost({ filePath: '/x', content: '' });
    const mgr = new HookManager(host, new HookLoader(__filename), () => ({}));
    await mgr.reload(slowHookPath);

    vi.useFakeTimers();
    const p = mgr.match();
    vi.advanceTimersByTime(30_001);
    await expect(p).rejects.toBeInstanceOf(HookTimeoutError);
    vi.useRealTimers();
  });
});
```

同时 create `tests/core/fixtures/hooks/slow.js`:

```js
module.exports = { match: () => new Promise(() => {}) };
```

- [ ] **Step 7: 跑测试**

```bash
pnpm run test tests/core/hook-manager.test.ts
```
Expected: 2 passed.

- [ ] **Step 8: 修 src/vscode/hook.ts 改为薄桥**

改 `src/vscode/hook.ts`（或 `hookBridge.ts`），保留单例 `Hook.getInstance()` API，内部用 `HookManager`：

```ts
import type { Host } from '@core/host';
import { HookManager } from '@core/hook/manager';
import { HookLoader } from '@core/hook/loader';

export default class Hook {
  private static _i: Hook;
  static getInstance() { return (Hook._i ??= new Hook()); }
  private mgr?: HookManager;
  // ... setHost / init / reload / dispatch 转发到 mgr
}
```

**保留** `Hook` 单例原有外部 API（`init(ctx)`, `reload()`, `onChange()`, `dispose()`），仅把内部实现改走 HookManager。

- [ ] **Step 9: 编译 + 冒烟 + commit**

```bash
pnpm run compile && pnpm run test
git add -A && git commit -m "feat(core): extract HookManager with timeout and fixture tests"
```

---

### Task 12: Hook 热重载接入 Host.watch

**Files:**
- Modify: `src/vscode/hook.ts`（用 host.watch 代替现有 chokidar 直调）

- [ ] **Step 1: 在 Hook 桥里订阅 host.watch**

```ts
this.host.watch(hookFilePattern, async (absPath) => {
  await this.mgr!.reload(absPath);
  this.emit('change');
});
```

移除原有 chokidar 直接实例化的代码。

- [ ] **Step 2: 编译 + 冒烟**

改一下 `.vscode/i18n-fast.hook.js` 观察是否热重载。

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "refactor(vscode): use host.watch for hook hot-reload"
```

---

### Task 13: Hook 旧 vscode API 兼容层（VS Code 模式注入 vscode）

**目标**：VS Code 模式下旧 hook 代码 `require('vscode')` / `ctx.vscode.window.xxx` 零破坏。

**Files:**
- Modify: `src/core/hook/context.ts`（增加 `legacyVscode?: unknown` 参数）
- Modify: `src/vscode/hook.ts`（创建时传入真 `require('vscode')`）

- [ ] **Step 1: 修 createHookContext 接受 legacyVscode**

```ts
export function createHookContext(params: {
  host: Host;
  utilExtras?: Record<string, unknown>;
  config: unknown;
  legacyVscode?: unknown;
}): HookContext {
  const ctx = { host: params.host, active: params.host.getActiveContext(), util: createUtils(params.utilExtras), config: params.config } as HookContext & { vscode?: unknown };
  if (params.legacyVscode) {
    (ctx as any).vscode = params.legacyVscode;
  }
  return ctx;
}
```

- [ ] **Step 2: 修 HookManager 构造器接收 legacyVscode**

```ts
constructor(
  private readonly host: Host,
  private readonly loader: HookLoader,
  private readonly getConfig: () => unknown,
  private readonly legacyVscode?: unknown
) {}
```

并把 `buildCtx` 改成传入 `legacyVscode`。

- [ ] **Step 3: VsCode Bridge 传 `require('vscode')`**

在 `src/vscode/hook.ts` 里：

```ts
import * as vscode from 'vscode';
this.mgr = new HookManager(this.host, loader, () => getConfig(), vscode);
```

- [ ] **Step 4: 编译 + 冒烟 + commit**

```bash
pnpm run compile
# 冒烟：确保旧 hook.js 里若用了 ctx.vscode.* 仍能工作
git add -A && git commit -m "feat(hook): preserve legacy vscode injection in VS Code mode"
```

---

### Task 14: i18n 扫描 + 缓存抽到 core/i18n/

**Files:**
- Create: `src/core/i18n/scanner.ts`, `src/core/i18n/cache.ts`, `tests/core/i18n-cache.test.ts`
- Modify: `src/vscode/i18n.ts`（改为薄桥）

- [ ] **Step 1: 写 scanner.ts**

```ts
import type { Host } from '../host';
import type { HookManager } from '../hook/manager';
import type { I18nEntry } from '../types';

export class I18nScanner {
  constructor(private readonly host: Host, private readonly hookManager: HookManager) {}

  async scan(pattern: string): Promise<I18nEntry[]> {
    if (!pattern) return [];
    const files = await this.host.findFiles(pattern);
    const all: I18nEntry[] = [];
    for (const f of files) {
      const content = await this.host.readFile(f);
      const entries = await this.hookManager.collectI18n(content, f);
      all.push(...entries);
    }
    return all;
  }
}
```

- [ ] **Step 2: 写 cache.ts**

```ts
import type { I18nEntry } from '../types';

export class I18nCache {
  private entries: I18nEntry[] = [];

  replace(entries: I18nEntry[]): void {
    this.entries = entries;
  }

  all(): readonly I18nEntry[] {
    return this.entries;
  }

  byKey(key: string): I18nEntry[] {
    return this.entries.filter((e) => e.key === key);
  }

  byText(text: string): I18nEntry[] {
    return this.entries.filter((e) => e.text === text);
  }

  paginate(opts: { locale?: string; limit: number; offset: number }): { entries: I18nEntry[]; total: number } {
    const filtered = opts.locale ? this.entries.filter((e) => e.locale === opts.locale) : this.entries;
    return {
      entries: filtered.slice(opts.offset, opts.offset + opts.limit),
      total: filtered.length
    };
  }
}
```

- [ ] **Step 3: 写测试**

Create `tests/core/i18n-cache.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { I18nCache } from '@core/i18n/cache';

describe('I18nCache', () => {
  it('按 key / text / locale 查', () => {
    const c = new I18nCache();
    c.replace([
      { key: 'I18N.a', text: '添加', locale: 'zh', filePath: '/w/zh.json' },
      { key: 'I18N.a', text: 'Add', locale: 'en', filePath: '/w/en.json' },
      { key: 'I18N.b', text: '删除', locale: 'zh', filePath: '/w/zh.json' }
    ]);
    expect(c.byKey('I18N.a')).toHaveLength(2);
    expect(c.byText('添加')[0].locale).toBe('zh');
    const p = c.paginate({ locale: 'zh', limit: 1, offset: 0 });
    expect(p.total).toBe(2);
    expect(p.entries).toHaveLength(1);
  });
});
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm run test tests/core/i18n-cache.test.ts
git add -A && git commit -m "feat(core): extract i18n scanner and cache with tests"
```

- [ ] **Step 5: 把 src/vscode/i18n.ts 改为薄桥**

保留单例 API，把实际扫描逻辑委托给 `I18nScanner` + `I18nCache`。保持 `I18n.getInstance().onChange()` 事件不变。

```bash
pnpm run compile
git add -A && git commit -m "refactor(vscode): delegate i18n scanning to core"
```

---

### Task 15: Convert pipeline 抽到 core/convert/

**Files:**
- Create: `src/core/convert/pipeline.ts`, `tests/core/convert-pipeline.test.ts`
- Modify: `src/vscode/handler.ts`（convert command 走 pipeline）

- [ ] **Step 1: 写 pipeline.ts**

```ts
import type { Host } from '../host';
import type { HookManager } from '../hook/manager';
import type { ConvertGroup, ConflictPolicy } from '../types';
import type { FileSnapshotStack } from '../snapshot/fileSnapshotStack';
import type { I18nCache } from '../i18n/cache';
import { detectConflicts, ConflictReport } from './conflictDetector';
import { buildDiff, SourcePatch } from './diffBuilder';

export interface WriteTrace {
  path: string;
  bytes_changed: number;
}

export interface ConvertPipelineDeps {
  host: Host;
  hookManager: HookManager;
  snapshots: FileSnapshotStack;
  i18nCache: I18nCache;
}

export interface ConvertRunOptions {
  conflictPolicy: ConflictPolicy;
  pickerResolutions?: Record<string, string>;
}

export interface ConvertRunResult {
  source_patches: SourcePatch[];
  i18n_writes_applied: Array<{ path: string; bytes_changed: number }>;
  undo_token?: string;
  conflicts?: ConflictReport[];
}

export async function runConvert(
  deps: ConvertPipelineDeps,
  opts: ConvertRunOptions
): Promise<ConvertRunResult> {
  const { host, hookManager, snapshots, i18nCache } = deps;

  const matched = await hookManager.match();
  if (matched.length === 0) return { source_patches: [], i18n_writes_applied: [] };

  const converted = await hookManager.convert(matched);

  const conflicts = detectConflicts(converted, i18nCache, {
    policy: opts.conflictPolicy,
    resolutions: opts.pickerResolutions ?? {}
  });
  const unresolved = conflicts.filter((c) => c.resolution === undefined);
  if (unresolved.length > 0) {
    return { source_patches: [], i18n_writes_applied: [], conflicts: unresolved };
  }

  // 把 resolutions 应用回 converted（如 reuse:xxx 复用 key）
  const finalized = applyResolutions(converted, conflicts);

  snapshots.next();
  // 让 hook.write 过程中对 host.writeFile 的每次调用先 record 再写：
  // 在 Task 16 里由 wrapHostForRecording 填充 traces。
  const traces: WriteTrace[] = [];
  // 实际包装 + hookManager.pushHostOverride / popHostOverride 在 Task 16 接入；
  // 此处先保留调用点形状：
  await hookManager.write(finalized);

  const token = snapshots.seal();

  const source_patches = await buildDiff(host, finalized);

  return {
    source_patches,
    i18n_writes_applied: traces,
    undo_token: token
  };
}

function applyResolutions(groups: ConvertGroup[], reports: ConflictReport[]): ConvertGroup[] {
  const byId = new Map(reports.map((r) => [r.groupId, r]));
  return groups.map((g) => {
    const r = byId.get(g.id);
    if (r?.resolution?.startsWith('reuse:')) {
      return { ...g, key: r.resolution.slice(6) };
    }
    return g;
  });
}

```

- [ ] **Step 2: 写 stub conflictDetector**

Create `src/core/convert/conflictDetector.ts`:

```ts
import type { ConvertGroup, ConflictPolicy } from '../types';
import type { I18nCache } from '../i18n/cache';

export interface ConflictReport {
  groupId: string;
  originalText: string;
  candidates: Array<{ key: string; text: string; score: number }>;
  resolution?: string;
}

export function detectConflicts(
  groups: ConvertGroup[],
  cache: I18nCache,
  opts: { policy: ConflictPolicy; resolutions: Record<string, string> }
): ConflictReport[] {
  return groups.map((g) => {
    const hits = cache.byText(g.originalText);
    if (hits.length === 0) return { groupId: g.id, originalText: g.originalText, candidates: [], resolution: 'new' };

    const candidates = hits.map((h) => ({ key: h.key, text: h.text, score: 1 }));
    const preset = opts.resolutions[g.id];
    if (preset) return { groupId: g.id, originalText: g.originalText, candidates, resolution: preset };

    switch (opts.policy) {
      case 'reuse': return { groupId: g.id, originalText: g.originalText, candidates, resolution: `reuse:${hits[0].key}` };
      case 'ignore': return { groupId: g.id, originalText: g.originalText, candidates, resolution: 'new' };
      case 'smart':
        return hits.length === 1
          ? { groupId: g.id, originalText: g.originalText, candidates, resolution: `reuse:${hits[0].key}` }
          : { groupId: g.id, originalText: g.originalText, candidates, resolution: undefined };
      case 'picker':
        return { groupId: g.id, originalText: g.originalText, candidates, resolution: undefined };
    }
  });
}
```

- [ ] **Step 3: 写 stub diffBuilder**

Create `src/core/convert/diffBuilder.ts`:

```ts
import type { Host } from '../host';
import type { ConvertGroup } from '../types';

export interface SourcePatch {
  path: string;
  unified_diff: string;
}

export async function buildDiff(host: Host, groups: ConvertGroup[]): Promise<SourcePatch[]> {
  // 按 filePath 分组，读原文件，应用所有 (range, replacementText) 替换，生成 unified diff
  // 实现延后到 Task 21
  return [];
}
```

- [ ] **Step 4: 写 conflict detector 测试**

Create `tests/core/conflict-detector.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectConflicts } from '@core/convert/conflictDetector';
import { I18nCache } from '@core/i18n/cache';

function cacheWith(entries: Array<{ key: string; text: string }>) {
  const c = new I18nCache();
  c.replace(entries.map((e) => ({ ...e, locale: 'zh', filePath: '/w/zh.json' })));
  return c;
}

describe('detectConflicts', () => {
  const g = (id: string, text: string) => ({ id, filePath: '/x', range: { start: 0, end: 0 }, originalText: text });

  it('smart + 唯一命中 → reuse', () => {
    const reports = detectConflicts([g('1', '添加')], cacheWith([{ key: 'I18N.a', text: '添加' }]), { policy: 'smart', resolutions: {} });
    expect(reports[0].resolution).toBe('reuse:I18N.a');
  });

  it('smart + 多命中 → 待决', () => {
    const reports = detectConflicts([g('1', '添加')], cacheWith([{ key: 'I18N.a', text: '添加' }, { key: 'I18N.b', text: '添加' }]), { policy: 'smart', resolutions: {} });
    expect(reports[0].resolution).toBeUndefined();
  });

  it('显式 resolutions 优先', () => {
    const reports = detectConflicts([g('1', '添加')], cacheWith([{ key: 'I18N.a', text: '添加' }]), { policy: 'smart', resolutions: { '1': 'new' } });
    expect(reports[0].resolution).toBe('new');
  });

  it('无命中 → new', () => {
    const reports = detectConflicts([g('1', '新词')], cacheWith([]), { policy: 'smart', resolutions: {} });
    expect(reports[0].resolution).toBe('new');
  });
});
```

- [ ] **Step 5: 跑测试**

```bash
pnpm run test tests/core/conflict-detector.test.ts
```
Expected: 4 passed.

- [ ] **Step 6: 修 src/vscode/handler.ts convert command 走 pipeline**

重构 `createOnCommandConvertHandler`：
- 原流程：`match → convert → conflict UI → write` 四个内联步骤
- 新流程：调 `runConvert(...)`，处理 picker 冲突时用原 VS Code QuickPick 让用户选，构造 resolutions 再调一次 `runConvert`

**确保原有 UX（picker 仍弹 QuickPick）保留**。

- [ ] **Step 7: 编译 + 冒烟 + commit**

```bash
pnpm run compile
git add -A && git commit -m "feat(core): extract convert pipeline and conflict detector"
```

---

### Task 16: Write-trace Host wrapper + snapshot 集成

**目标**：让 `runConvert` 能在 hook.write 过程中自动 record 快照，且报告 `i18n_writes_applied`。

**Files:**
- Create: `src/core/snapshot/recordingHost.ts`, `tests/core/recording-host.test.ts`
- Modify: `src/core/convert/pipeline.ts`

- [ ] **Step 1: 写 recordingHost.ts**

```ts
import type { Host, ActiveContext, Disposable } from '../host';
import type { FileSnapshotStack } from './fileSnapshotStack';

export interface WriteTrace {
  path: string;
  bytes_changed: number;
}

export function wrapHostForRecording(
  inner: Host,
  snapshots: FileSnapshotStack,
  traces: WriteTrace[]
): Host {
  return {
    get mode() { return inner.mode; },
    get workspaceRoot() { return inner.workspaceRoot; },
    readFile: (p) => inner.readFile(p),
    exists: (p) => inner.exists(p),
    findFiles: (i, e) => inner.findFiles(i, e),
    watch: (g, cb) => inner.watch(g, cb),
    getActiveContext: () => inner.getActiveContext(),
    log: (lvl, msg) => inner.log(lvl, msg),
    async writeFile(absPath: string, content: string) {
      const before = (await inner.exists(absPath)) ? await inner.readFile(absPath) : '';
      snapshots.record(absPath, before);
      await inner.writeFile(absPath, content);
      traces.push({ path: absPath, bytes_changed: Buffer.byteLength(content, 'utf-8') - Buffer.byteLength(before, 'utf-8') });
    }
  };
}
```

- [ ] **Step 2: 写测试**

Create `tests/core/recording-host.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { wrapHostForRecording } from '@core/snapshot/recordingHost';
import { FileSnapshotStack } from '@core/snapshot/fileSnapshotStack';
import type { Host } from '@core/host';

function memoryHost(initial: Record<string, string>): Host {
  const m = new Map(Object.entries(initial));
  return {
    mode: 'mcp', workspaceRoot: '/w',
    async readFile(p) { return m.get(p) ?? ''; },
    async writeFile(p, c) { m.set(p, c); },
    async exists(p) { return m.has(p); },
    async findFiles() { return []; },
    watch() { return { dispose() {} }; },
    getActiveContext() { return undefined; },
    log() {}
  };
}

describe('wrapHostForRecording', () => {
  it('写前 record 原内容', async () => {
    const inner = memoryHost({ '/w/a.json': '{"x":1}' });
    const stack = new FileSnapshotStack();
    stack.next();
    const traces: any[] = [];
    const wrapped = wrapHostForRecording(inner, stack, traces);

    await wrapped.writeFile('/w/a.json', '{"x":2}');
    const token = stack.seal();

    expect(traces[0].path).toBe('/w/a.json');
    expect(traces[0].bytes_changed).toBe(0);  // 等长
    expect(stack.undo(token)![0].content).toBe('{"x":1}');
  });
});
```

- [ ] **Step 3: HookManager 增 override 栈**

修 `src/core/hook/manager.ts`（对 Task 11 版本的修改）：

```ts
private overrides: Host[] = [];
pushHostOverride(h: Host) { this.overrides.push(h); }
popHostOverride() { this.overrides.pop(); }
private get effectiveHost(): Host {
  return this.overrides[this.overrides.length - 1] ?? this.hostProvider();
}
```

并把所有 `this.host`（来自 Task 16 前版本的 private get）的引用改为 `this.effectiveHost`。`buildCtx` 里也要用 `this.effectiveHost` 构造 HookContext。

- [ ] **Step 4: 把 pipeline 里的 traces 串起来**

修改 `src/core/convert/pipeline.ts` 的 `runConvert`：

```ts
import { wrapHostForRecording, type WriteTrace } from '../snapshot/recordingHost';

// 替换 Task 15 里 `const traces: WriteTrace[] = [];` 之后的 `await hookManager.write(...)` 片段：
const wrapped = wrapHostForRecording(host, snapshots, traces);
hookManager.pushHostOverride(wrapped);
try {
  await hookManager.write(finalized);
} finally {
  hookManager.popHostOverride();
}
```

此时 `i18n_writes_applied: traces` 即可填上真实数据。

- [ ] **Step 5: 跑所有测试 + commit**

```bash
pnpm run test
git add -A && git commit -m "feat(core): wire snapshot+write trace via host wrapper"
```

---

### Task 17: 新增 MCP SDK + FsHost + server 骨架

**Files:**
- Create: `src/mcp/server.ts`, `src/mcp/fsHost.ts`, `tests/mcp/fs-host.test.ts`, `webpack.mcp.config.js`
- Modify: `package.json` (bin, dev deps, scripts)

- [ ] **Step 1: 安装依赖**

```bash
pnpm add -D @modelcontextprotocol/sdk fast-glob @types/fast-glob
```

- [ ] **Step 2: 写 FsHost**

Create `src/mcp/fsHost.ts`:

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import chokidar from 'chokidar';
import type { Host, ActiveContext, Disposable } from '@core/host';

export class PathOutsideWorkspaceError extends Error {
  constructor(public readonly path: string) {
    super(`path outside workspace: ${path}`);
  }
}

export interface FsHostOptions {
  workspaceRoot: string;
  getActiveContext?: () => ActiveContext | undefined;
}

export class FsHost implements Host {
  readonly mode = 'mcp' as const;
  readonly workspaceRoot: string;
  private readonly activeProvider: () => ActiveContext | undefined;

  constructor(opts: FsHostOptions) {
    this.workspaceRoot = path.resolve(opts.workspaceRoot);
    this.activeProvider = opts.getActiveContext ?? (() => undefined);
  }

  private ensureInside(absPath: string): void {
    const rel = path.relative(this.workspaceRoot, absPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new PathOutsideWorkspaceError(absPath);
    }
  }

  async readFile(absPath: string): Promise<string> {
    return await fs.readFile(absPath, 'utf-8');
  }

  async writeFile(absPath: string, content: string): Promise<void> {
    this.ensureInside(absPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, 'utf-8');
  }

  async exists(absPath: string): Promise<boolean> {
    try { await fs.access(absPath); return true; } catch { return false; }
  }

  async findFiles(include: string, exclude?: string): Promise<string[]> {
    const results = await fg(include, {
      cwd: this.workspaceRoot,
      ignore: exclude ? [exclude] : [],
      absolute: true,
      dot: false
    });
    return results;
  }

  watch(glob: string, onChange: (absPath: string) => void): Disposable {
    const watcher = chokidar.watch(glob, { cwd: this.workspaceRoot, ignoreInitial: true });
    watcher.on('all', (_event, file) => onChange(path.resolve(this.workspaceRoot, file)));
    return { dispose() { watcher.close(); } };
  }

  getActiveContext(): ActiveContext | undefined {
    return this.activeProvider();
  }

  log(level: 'debug' | 'info' | 'warn' | 'error', msg: string): void {
    const line = `[${level}] ${msg}\n`;
    process.stderr.write(line);
  }
}
```

- [ ] **Step 3: 写 FsHost 测试**

Create `tests/mcp/fs-host.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FsHost, PathOutsideWorkspaceError } from '@mcp/fsHost';

describe('FsHost', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-fast-test-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('writeFile → readFile roundtrip', async () => {
    const host = new FsHost({ workspaceRoot: root });
    const p = path.join(root, 'a/b.json');
    await host.writeFile(p, '{"x":1}');
    expect(await host.readFile(p)).toBe('{"x":1}');
  });

  it('writeFile 拒绝工作区外路径', async () => {
    const host = new FsHost({ workspaceRoot: root });
    await expect(host.writeFile('/etc/passwd', 'x')).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
  });

  it('findFiles 返绝对路径', async () => {
    await fs.writeFile(path.join(root, 'a.json'), '{}');
    const host = new FsHost({ workspaceRoot: root });
    const files = await host.findFiles('*.json');
    expect(files).toEqual([path.join(root, 'a.json')]);
  });
});
```

- [ ] **Step 4: 跑测试**

```bash
pnpm run test tests/mcp/fs-host.test.ts
```
Expected: 3 passed.

- [ ] **Step 5: 写 server.ts 骨架（只注册 ping tool，先打通连通）**

Create `src/mcp/server.ts`:

```ts
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { FsHost } from './fsHost';

function parseArgs(argv: string[]): { workspace: string } {
  const i = argv.indexOf('--workspace');
  const workspace = i >= 0 ? argv[i + 1] : process.cwd();
  return { workspace };
}

async function main() {
  const { workspace } = parseArgs(process.argv.slice(2));
  const host = new FsHost({ workspaceRoot: workspace });
  host.log('info', `i18n-fast MCP starting at workspace ${host.workspaceRoot}`);

  const server = new Server({ name: 'i18n-fast', version: '0.1.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      { name: 'ping', description: 'Health check', inputSchema: { type: 'object', properties: {} } }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name === 'ping') {
      return { content: [{ type: 'text', text: `ok @ ${host.workspaceRoot}` }] };
    }
    throw new Error(`unknown tool: ${req.params.name}`);
  });

  await server.connect(new StdioServerTransport());
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 6: 写 webpack.mcp.config.js**

Create `webpack.mcp.config.js`:

```js
//@ts-check
'use strict';
const path = require('path');

/** @type {import('webpack').Configuration} */
const mcpConfig = {
  target: 'node',
  mode: 'none',
  entry: './src/mcp/server.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'mcp-server.js',
    libraryTarget: 'commonjs2',
    clean: false
  },
  externals: { fsevents: 'commonjs fsevents' },
  resolve: { extensions: ['.ts', '.js'], alias: {
    '@core': path.resolve(__dirname, 'src/core'),
    '@mcp': path.resolve(__dirname, 'src/mcp'),
    '@vscode-ext': path.resolve(__dirname, 'src/vscode')
  }},
  module: { rules: [{ test: /\.ts$/, exclude: /node_modules/, use: [{ loader: 'ts-loader' }] }] },
  devtool: 'nosources-source-map',
  plugins: [new (require('webpack').BannerPlugin)({ banner: '#!/usr/bin/env node', raw: true, entryOnly: true })]
};

module.exports = [mcpConfig];
```

- [ ] **Step 7: 加 scripts + bin**

修 `package.json`：

```jsonc
"bin": { "i18n-fast-mcp": "./dist/mcp-server.js" },
"scripts": {
  ...
  "build:vscode": "webpack",
  "build:mcp": "webpack --config webpack.mcp.config.js",
  "build": "pnpm run build:vscode && pnpm run build:mcp"
}
```

保留原 `compile` 别名指向 `build:vscode`（避免现有 publish 脚本破坏）。

- [ ] **Step 8: 打包并连通测试**

```bash
pnpm run build:mcp
chmod +x dist/mcp-server.js
# 简单 JSON-RPC 冒烟（可跳过）
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/mcp-server.js --workspace $(pwd)
```

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(mcp): scaffold FsHost, stdio server, webpack config"
```

---

### Task 18: 实现 vscodeShim（require 拦截 + API 清单）

**Files:**
- Create: `src/mcp/vscodeShim.ts`, `tests/mcp/vscode-shim.test.ts`
- Modify: `src/mcp/server.ts`（启动时装 shim）

- [ ] **Step 1: 写 vscodeShim.ts**

```ts
import Module from 'node:module';
import type { Host } from '@core/host';

export class UnsupportedInMcpError extends Error {
  constructor(public readonly api: string) {
    super(`vscode.${api} is not available in MCP mode. Use ctx.host.* instead.`);
    this.name = 'UnsupportedInMcpError';
  }
}

export function installVscodeShim(host: Host): void {
  const shim = buildShim(host);
  const originalLoad = (Module as any)._load;
  (Module as any)._load = function (request: string, parent: any, ...rest: any[]) {
    if (request === 'vscode') return shim;
    return originalLoad.call(this, request, parent, ...rest);
  };
}

function buildShim(host: Host): unknown {
  const guard = (path: string) => { throw new UnsupportedInMcpError(path); };

  class Position {
    constructor(public readonly line: number, public readonly character: number) {}
  }
  class Range {
    constructor(public readonly start: Position, public readonly end: Position) {}
  }
  class Uri {
    readonly scheme = 'file';
    constructor(public readonly fsPath: string) {}
    static file(p: string) { return new Uri(p); }
    static parse(s: string) { return new Uri(s.replace(/^file:\/\//, '')); }
    get path() { return this.fsPath; }
    toString() { return `file://${this.fsPath}`; }
  }

  const workspace = {
    get workspaceFolders() {
      return [{ uri: Uri.file(host.workspaceRoot), name: 'workspace', index: 0 }];
    },
    fs: {
      async readFile(uri: Uri) { return Buffer.from(await host.readFile(uri.fsPath), 'utf-8'); },
      async writeFile(uri: Uri, bytes: Uint8Array) { await host.writeFile(uri.fsPath, Buffer.from(bytes).toString('utf-8')); },
      async stat(uri: Uri) { if (!(await host.exists(uri.fsPath))) throw new Error('ENOENT'); return { type: 1 }; },
      async readDirectory() { return guard('workspace.fs.readDirectory'); }
    },
    findFiles(include: string, exclude?: string) { return host.findFiles(include, exclude).then((ps) => ps.map(Uri.file)); },
    getConfiguration() { return { get: () => undefined, has: () => false, inspect: () => undefined, update: () => {} }; },
    asRelativePath(p: string) { return p.startsWith(host.workspaceRoot) ? p.slice(host.workspaceRoot.length + 1) : p; },
    openTextDocument: () => guard('workspace.openTextDocument'),
    onDidChangeTextDocument: () => guard('workspace.onDidChangeTextDocument'),
    onDidChangeConfiguration: () => guard('workspace.onDidChangeConfiguration')
  };

  return new Proxy({}, {
    get(_target, prop: string) {
      switch (prop) {
        case 'Uri': return Uri;
        case 'Range': return Range;
        case 'Position': return Position;
        case 'workspace': return workspace;
        case 'window': return new Proxy({}, { get(_t, p: string) { return () => guard(`window.${p}`); } });
        case 'commands': return new Proxy({}, { get(_t, p: string) { return () => guard(`commands.${p}`); } });
        case 'languages': return new Proxy({}, { get(_t, p: string) { return () => guard(`languages.${p}`); } });
        case 'env': return { clipboard: new Proxy({}, { get(_t, p: string) { return () => guard(`env.clipboard.${p}`); } }) };
        case 'EventEmitter': return class { /* no-op for shim */ };
        default: return undefined;
      }
    }
  });
}
```

- [ ] **Step 2: 写测试**

Create `tests/mcp/vscode-shim.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { installVscodeShim, UnsupportedInMcpError } from '@mcp/vscodeShim';
import type { Host } from '@core/host';

function fakeHost(): Host {
  return {
    mode: 'mcp', workspaceRoot: '/w',
    async readFile() { return 'hello'; },
    async writeFile() {},
    async exists() { return true; },
    async findFiles() { return ['/w/a.json']; },
    watch() { return { dispose() {} }; },
    getActiveContext() { return undefined; },
    log() {}
  };
}

beforeAll(() => {
  installVscodeShim(fakeHost());
});

describe('vscodeShim', () => {
  it('Uri.file 返带 fsPath', () => {
    const vs = require('vscode');
    expect(vs.Uri.file('/x').fsPath).toBe('/x');
  });

  it('workspace.fs.readFile 桥到 host', async () => {
    const vs = require('vscode');
    const bytes = await vs.workspace.fs.readFile(vs.Uri.file('/w/a'));
    expect(Buffer.from(bytes).toString()).toBe('hello');
  });

  it('window.showQuickPick 抛 UnsupportedInMcpError', () => {
    const vs = require('vscode');
    expect(() => vs.window.showQuickPick([])).toThrow(UnsupportedInMcpError);
  });

  it('env.clipboard.readText 抛 UnsupportedInMcpError', () => {
    const vs = require('vscode');
    expect(() => vs.env.clipboard.readText()).toThrow(UnsupportedInMcpError);
  });
});
```

- [ ] **Step 3: 跑测试**

```bash
pnpm run test tests/mcp/vscode-shim.test.ts
```
Expected: 4 passed.

- [ ] **Step 4: 在 server.ts 里装 shim**

修 `src/mcp/server.ts` 的 main，在创建 host 之后立即：

```ts
import { installVscodeShim } from './vscodeShim';
installVscodeShim(host);
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(mcp): install vscode require shim with UI API guards"
```

---

### Task 19: MCP 里初始化 HookManager + I18nScanner + 缓存

**Files:**
- Create: `src/mcp/runtime.ts`
- Modify: `src/mcp/server.ts`

- [ ] **Step 1: 写 runtime.ts**

```ts
import path from 'node:path';
import { HookLoader } from '@core/hook/loader';
import { HookManager } from '@core/hook/manager';
import { I18nScanner } from '@core/i18n/scanner';
import { I18nCache } from '@core/i18n/cache';
import { FileSnapshotStack } from '@core/snapshot/fileSnapshotStack';
import type { Host } from '@core/host';

export interface McpRuntime {
  host: Host;
  hookManager: HookManager;
  scanner: I18nScanner;
  cache: I18nCache;
  snapshots: FileSnapshotStack;
  readConfig(): { hookFilePattern: string; i18nFilePattern: string; conflictPolicy: 'smart' | 'reuse' | 'ignore' | 'picker'; autoMatchChinese: boolean };
}

export async function buildRuntime(host: Host): Promise<McpRuntime> {
  // config 来源：MCP 下读取 workspace 里的 .vscode/settings.json 作为默认
  const configPath = path.join(host.workspaceRoot, '.vscode', 'settings.json');
  let raw: any = {};
  if (await host.exists(configPath)) {
    try { raw = JSON.parse(await host.readFile(configPath)); } catch { raw = {}; }
  }

  const readConfig = () => ({
    hookFilePattern: raw['i18n-fast.hookFilePattern'] ?? '.vscode/i18n-fast.hook.js',
    i18nFilePattern: raw['i18n-fast.i18nFilePattern'] ?? '',
    conflictPolicy: raw['i18n-fast.conflictPolicy'] ?? 'smart',
    autoMatchChinese: raw['i18n-fast.autoMatchChinese'] ?? true
  });

  const loader = new HookLoader(path.join(host.workspaceRoot, 'mcp-anchor.js'));
  const hookManager = new HookManager(() => host, loader, readConfig);
  const snapshots = new FileSnapshotStack({ maxSize: 10 });
  const cache = new I18nCache();
  const scanner = new I18nScanner(host, hookManager);

  return { host, hookManager, scanner, cache, snapshots, readConfig };
}

export async function ensureHookLoaded(rt: McpRuntime): Promise<void> {
  if (rt.hookManager.isLoaded()) return;
  const cfg = rt.readConfig();
  const abs = path.resolve(rt.host.workspaceRoot, cfg.hookFilePattern);
  if (!(await rt.host.exists(abs))) {
    throw new HookNotFoundError(abs);
  }
  await rt.hookManager.reload(abs);
}

export class HookNotFoundError extends Error {
  constructor(public readonly expectedPath: string) {
    super(`hook file not found at ${expectedPath}`);
    this.name = 'HookNotFoundError';
  }
}

export async function ensureI18nLoaded(rt: McpRuntime): Promise<void> {
  const cfg = rt.readConfig();
  if (!cfg.i18nFilePattern) return;
  await ensureHookLoaded(rt);
  const entries = await rt.scanner.scan(cfg.i18nFilePattern);
  rt.cache.replace(entries);
}
```

- [ ] **Step 2: server.ts 构建 runtime**

```ts
import { buildRuntime } from './runtime';
// ...
const runtime = await buildRuntime(host);
// 注册 watch（热重载）
host.watch('.vscode/i18n-fast.hook.js', async () => {
  try { await runtime.hookManager.reload(path.resolve(host.workspaceRoot, runtime.readConfig().hookFilePattern)); } catch {}
});
```

- [ ] **Step 3: 编译 + commit**

```bash
pnpm run build:mcp
git add -A && git commit -m "feat(mcp): runtime wiring for hook manager and i18n cache"
```

---

### Task 20: 实现 `query_i18n` tool

**Files:**
- Create: `src/mcp/tools/queryI18n.ts`, `src/mcp/errors.ts`, `tests/mcp/tool-query-i18n.test.ts`
- Modify: `src/mcp/server.ts`

- [ ] **Step 1: 写错误类**

Create `src/mcp/errors.ts`:

```ts
export class McpToolError extends Error {
  constructor(public readonly code: string, message: string, public readonly data?: unknown) {
    super(message);
    this.name = 'McpToolError';
  }
}
```

- [ ] **Step 2: 写 query_i18n handler**

Create `src/mcp/tools/queryI18n.ts`:

```ts
import type { McpRuntime } from '../runtime';
import { ensureI18nLoaded } from '../runtime';

export const queryI18nSchema = {
  name: 'query_i18n',
  description: '反查 i18n key 原文，或判断文本是否已有对应 key。',
  inputSchema: {
    type: 'object',
    properties: {
      keys: { type: 'array', items: { type: 'string' } },
      text: { type: 'string' },
      locale: { type: 'string' }
    }
  }
} as const;

export async function handleQueryI18n(
  rt: McpRuntime,
  args: { keys?: string[]; text?: string; locale?: string }
): Promise<{ hits: Array<{ key: string; locale: string; text: string; file: string }>; misses: string[] }> {
  await ensureI18nLoaded(rt);
  const all = rt.cache.all();
  const hits: Array<{ key: string; locale: string; text: string; file: string }> = [];
  const misses: string[] = [];

  if (args.keys) {
    for (const k of args.keys) {
      const matches = all.filter((e) => e.key === k && (!args.locale || e.locale === args.locale));
      if (matches.length > 0) {
        for (const m of matches) hits.push({ key: m.key, locale: m.locale, text: m.text, file: m.filePath });
      } else {
        misses.push(k);
      }
    }
  }

  if (args.text) {
    const matches = all.filter((e) => e.text === args.text && (!args.locale || e.locale === args.locale));
    for (const m of matches) hits.push({ key: m.key, locale: m.locale, text: m.text, file: m.filePath });
  }

  return { hits, misses };
}
```

- [ ] **Step 3: 挂到 server.ts**

在 `ListToolsRequestSchema` handler 里追加 `queryI18nSchema`；在 `CallToolRequestSchema` 里：

```ts
if (req.params.name === 'query_i18n') {
  const result = await handleQueryI18n(runtime, req.params.arguments as any);
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}
```

- [ ] **Step 4: 契约测试**

Create `tests/mcp/tool-query-i18n.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function writeFixture(root: string) {
  await fs.mkdir(path.join(root, '.vscode'), { recursive: true });
  await fs.mkdir(path.join(root, 'locales'), { recursive: true });
  await fs.writeFile(path.join(root, 'locales/zh.json'), JSON.stringify({ 'I18N.a': '添加' }));
  await fs.writeFile(path.join(root, '.vscode/i18n-fast.hook.js'), `
    module.exports = {
      collectI18n(content, filePath) {
        const j = JSON.parse(content);
        const locale = filePath.match(/([a-z]+)\\.json$/)[1];
        return Object.entries(j).map(([key, text]) => ({ key, text, locale, filePath }));
      }
    };
  `);
  await fs.writeFile(path.join(root, '.vscode/settings.json'), JSON.stringify({
    'i18n-fast.hookFilePattern': '.vscode/i18n-fast.hook.js',
    'i18n-fast.i18nFilePattern': 'locales/*.json'
  }));
}

describe('query_i18n tool', () => {
  let root: string;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-fast-mcp-'));
    await writeFixture(root);
    transport = new StdioClientTransport({
      command: 'node',
      args: [path.resolve(__dirname, '../../dist/mcp-server.js'), '--workspace', root]
    });
    client = new Client({ name: 'test', version: '0' }, { capabilities: {} });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('按 key 命中', async () => {
    const res = await client.callTool({ name: 'query_i18n', arguments: { keys: ['I18N.a'] } });
    const payload = JSON.parse((res.content[0] as any).text);
    expect(payload.hits[0].text).toBe('添加');
    expect(payload.misses).toEqual([]);
  });

  it('按 text 命中', async () => {
    const res = await client.callTool({ name: 'query_i18n', arguments: { text: '添加' } });
    const payload = JSON.parse((res.content[0] as any).text);
    expect(payload.hits[0].key).toBe('I18N.a');
  });

  it('miss 在返回里', async () => {
    const res = await client.callTool({ name: 'query_i18n', arguments: { keys: ['I18N.not_exist'] } });
    const payload = JSON.parse((res.content[0] as any).text);
    expect(payload.misses).toEqual(['I18N.not_exist']);
  });
});
```

**注意**：测试依赖 `dist/mcp-server.js`，所以在 CI 里需要 `pnpm run build:mcp` 先跑。加 `vitest.config.ts` 的 `globalSetup` 或在 package.json 加 `"pretest": "pnpm run build:mcp"`。

- [ ] **Step 5: 跑测试**

```bash
pnpm run build:mcp && pnpm run test tests/mcp/tool-query-i18n.test.ts
```
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(mcp): implement query_i18n tool with contract tests"
```

---

### Task 21: 实现 diffBuilder

**Files:**
- Modify: `src/core/convert/diffBuilder.ts`
- Create: `tests/core/diff-builder.test.ts`
- 新增依赖 `diff`（用于生成 unified diff）

- [ ] **Step 1: 安装 diff 库**

```bash
pnpm add diff
pnpm add -D @types/diff
```

- [ ] **Step 2: 实现 buildDiff**

```ts
import { createTwoFilesPatch } from 'diff';
import type { Host } from '../host';
import type { ConvertGroup } from '../types';

export interface SourcePatch {
  path: string;
  unified_diff: string;
}

export async function buildDiff(host: Host, groups: ConvertGroup[]): Promise<SourcePatch[]> {
  const byFile = new Map<string, ConvertGroup[]>();
  for (const g of groups) {
    if (!g.replacementText) continue;
    const arr = byFile.get(g.filePath) ?? [];
    arr.push(g);
    byFile.set(g.filePath, arr);
  }

  const patches: SourcePatch[] = [];
  for (const [filePath, gs] of byFile) {
    const original = await host.readFile(filePath);
    const sorted = gs.slice().sort((a, b) => b.range.start - a.range.start); // 从后往前替换
    let next = original;
    for (const g of sorted) {
      next = next.slice(0, g.range.start) + g.replacementText! + next.slice(g.range.end);
    }
    const patch = createTwoFilesPatch(filePath, filePath, original, next, '', '', { context: 3 });
    patches.push({ path: filePath, unified_diff: patch });
  }
  return patches;
}
```

- [ ] **Step 3: 写测试**

```ts
import { describe, it, expect } from 'vitest';
import { buildDiff } from '@core/convert/diffBuilder';
import type { Host } from '@core/host';

function memHost(files: Record<string, string>): Host {
  const m = new Map(Object.entries(files));
  return { mode: 'mcp', workspaceRoot: '/', async readFile(p) { return m.get(p)!; }, async writeFile() {}, async exists(p) { return m.has(p); }, async findFiles() { return []; }, watch() { return { dispose() {} }; }, getActiveContext() { return undefined; }, log() {} };
}

describe('buildDiff', () => {
  it('生成单文件 unified diff', async () => {
    const host = memHost({ '/a.ts': 'const x = "添加";' });
    const patches = await buildDiff(host, [{
      id: '1', filePath: '/a.ts', range: { start: 11, end: 13 }, originalText: '添加',
      key: 'I18N.a', replacementText: "t('I18N.a')"
    }]);
    expect(patches).toHaveLength(1);
    expect(patches[0].unified_diff).toContain('-const x = "添加";');
    expect(patches[0].unified_diff).toContain('+const x = "t(\'I18N.a\')";');
  });
});
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm run test tests/core/diff-builder.test.ts
git add -A && git commit -m "feat(core): implement diffBuilder with unified diff tests"
```

---

### Task 22: 实现 `convert_text` tool（不含 picker 两轮）

**Files:**
- Create: `src/mcp/tools/convertText.ts`, `src/mcp/activeContextStore.ts`, `tests/mcp/tool-convert-text.test.ts`
- Modify: `src/mcp/server.ts`

- [ ] **Step 1: 写 activeContextStore.ts**

```ts
import type { ActiveContext } from '@core/host';

let current: ActiveContext | undefined;

export function setActive(ctx: ActiveContext | undefined) { current = ctx; }
export function getActive(): ActiveContext | undefined { return current; }
```

**注意**：MCP 单进程串行，单例安全。初始化 FsHost 时传 `getActiveContext: getActive`。修 `src/mcp/runtime.ts` 的 `buildRuntime` 接受 FsHost 而不是创建它；或在 server.ts 创建 FsHost 时传 `getActive`。改 server.ts：

```ts
import { getActive } from './activeContextStore';
const host = new FsHost({ workspaceRoot: workspace, getActiveContext: getActive });
```

- [ ] **Step 2: 写 convert_text handler**

```ts
import path from 'node:path';
import type { McpRuntime } from '../runtime';
import { ensureHookLoaded, ensureI18nLoaded } from '../runtime';
import { setActive } from '../activeContextStore';
import { runConvert } from '@core/convert/pipeline';
import { buildDiff } from '@core/convert/diffBuilder';
import { wrapHostForRecording } from '@core/snapshot/recordingHost';
import { ContentDriftError } from '../errors';

export const convertTextSchema = {
  name: 'convert_text',
  description: '把文件里的硬编码文本转换为 i18n key，返回源码 patch + 已写入的 i18n 文件。',
  inputSchema: {
    type: 'object',
    required: ['files'],
    properties: {
      files: {
        type: 'array',
        items: {
          type: 'object',
          required: ['path', 'content'],
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
            selections: { type: 'array', items: { type: 'object', required: ['start', 'end'], properties: { start: { type: 'number' }, end: { type: 'number' } } } }
          }
        }
      },
      conflict_policy: { type: 'string', enum: ['reuse', 'ignore', 'picker', 'smart'] },
      picker_resolutions: { type: 'object' }
    }
  }
} as const;

export async function handleConvertText(rt: McpRuntime, args: {
  files: Array<{ path: string; content: string; selections?: Array<{ start: number; end: number }> }>;
  conflict_policy?: 'reuse' | 'ignore' | 'picker' | 'smart';
  picker_resolutions?: Record<string, string>;
}) {
  await ensureHookLoaded(rt);
  await ensureI18nLoaded(rt);

  if (args.files.length !== 1) {
    throw new Error('convert_text 本期只支持单文件，files 长度必须为 1');
  }
  const [f] = args.files;
  const absPath = path.isAbsolute(f.path) ? f.path : path.resolve(rt.host.workspaceRoot, f.path);

  const onDisk = await rt.host.readFile(absPath);
  if (onDisk !== f.content) {
    throw new ContentDriftError(absPath);
  }

  setActive({ filePath: absPath, content: f.content, selections: f.selections });
  try {
    const result = await runConvert(
      { host: rt.host, hookManager: rt.hookManager, snapshots: rt.snapshots, i18nCache: rt.cache },
      { conflictPolicy: args.conflict_policy ?? rt.readConfig().conflictPolicy, pickerResolutions: args.picker_resolutions }
    );
    return result;
  } finally {
    setActive(undefined);
  }
}
```

- [ ] **Step 3: 把 ContentDriftError 加到 errors.ts**

```ts
export class ContentDriftError extends Error {
  readonly code = 'CONTENT_DRIFT';
  constructor(public readonly path: string) {
    super(`file content on disk differs from provided content: ${path}`);
  }
}
```

- [ ] **Step 4: 挂到 server.ts，把结构化错误写入 isError**

```ts
if (req.params.name === 'convert_text') {
  try {
    const result = await handleConvertText(runtime, req.params.arguments as any);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (e: any) {
    const code = e.code ?? e.name ?? 'INTERNAL';
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ code, message: e.message }) }] };
  }
}
```

- [ ] **Step 5: 契约测试（不测 picker 两轮，Task 23 再加）**

Create `tests/mcp/tool-convert-text.test.ts`（复用 Task 20 的 spawn/teardown 模式；把 fixture 写好包含 hook、settings、一个含中文的源文件）：

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function writeFixture(root: string) {
  await fs.mkdir(path.join(root, '.vscode'), { recursive: true });
  await fs.mkdir(path.join(root, 'locales'), { recursive: true });
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'locales/zh.json'), '{}');
  await fs.writeFile(path.join(root, 'src/a.ts'), 'const x = "添加用户";');
  await fs.writeFile(path.join(root, '.vscode/i18n-fast.hook.js'), `
    module.exports = {
      match(ctx) {
        const hits = ctx.util.matchChinese(ctx.active.content);
        return hits.map((h, i) => ({ id: 'g' + i, filePath: ctx.active.filePath, range: { start: h.start, end: h.end }, originalText: h.text }));
      },
      convert(groups) {
        return groups.map(g => ({ ...g, key: 'I18N.auto.' + g.id, replacementText: "t('I18N.auto." + g.id + "')" }));
      },
      async write(groups, ctx) {
        const p = ctx.host.workspaceRoot + '/locales/zh.json';
        const j = JSON.parse(await ctx.host.readFile(p));
        for (const g of groups) j[g.key] = g.originalText;
        await ctx.host.writeFile(p, JSON.stringify(j, null, 2));
      },
      collectI18n(content, filePath) {
        const j = JSON.parse(content);
        const locale = (filePath.match(/([a-z]+)\\.json$/) || [])[1] || 'zh';
        return Object.entries(j).map(([key, text]) => ({ key, text, locale, filePath }));
      }
    };
  `);
  await fs.writeFile(path.join(root, '.vscode/settings.json'), JSON.stringify({
    'i18n-fast.hookFilePattern': '.vscode/i18n-fast.hook.js',
    'i18n-fast.i18nFilePattern': 'locales/*.json',
    'i18n-fast.conflictPolicy': 'smart'
  }));
}

describe('convert_text tool', () => {
  let root: string;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-fast-convert-'));
    await writeFixture(root);
    transport = new StdioClientTransport({
      command: 'node',
      args: [path.resolve(__dirname, '../../dist/mcp-server.js'), '--workspace', root]
    });
    client = new Client({ name: 'test', version: '0' }, { capabilities: {} });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('转换整文件的中文并返 patch + undo_token', async () => {
    const filePath = path.join(root, 'src/a.ts');
    const content = await fs.readFile(filePath, 'utf-8');
    const res = await client.callTool({
      name: 'convert_text',
      arguments: { files: [{ path: filePath, content }] }
    });
    const payload = JSON.parse((res.content[0] as any).text);
    expect(payload.source_patches).toHaveLength(1);
    expect(payload.source_patches[0].unified_diff).toContain("t('I18N.auto");
    expect(payload.i18n_writes_applied.length).toBeGreaterThan(0);
    expect(payload.undo_token).toMatch(/^snap_/);

    const zh = JSON.parse(await fs.readFile(path.join(root, 'locales/zh.json'), 'utf-8'));
    expect(Object.values(zh)).toContain('添加用户');
  });

  it('content 和磁盘不一致时抛 CONTENT_DRIFT', async () => {
    const filePath = path.join(root, 'src/a.ts');
    const res = await client.callTool({
      name: 'convert_text',
      arguments: { files: [{ path: filePath, content: 'const x = "完全不同";' }] }
    });
    expect(res.isError).toBe(true);
    const payload = JSON.parse((res.content[0] as any).text);
    expect(payload.code).toBe('CONTENT_DRIFT');
  });
});
```

- [ ] **Step 6: 跑测试 + commit**

```bash
pnpm run build:mcp && pnpm run test tests/mcp/tool-convert-text.test.ts
git add -A && git commit -m "feat(mcp): implement convert_text tool with content-drift check"
```

---

### Task 23: picker 冲突两轮交互

**Files:**
- Modify: `src/core/convert/pipeline.ts`, `src/mcp/tools/convertText.ts`, `src/mcp/errors.ts`
- Create: `tests/mcp/tool-convert-text-picker.test.ts`

- [ ] **Step 1: 加 ConflictNeedsResolutionError**

```ts
export class ConflictNeedsResolutionError extends Error {
  readonly code = 'CONFLICT_NEEDS_RESOLUTION';
  constructor(public readonly conflicts: unknown[]) {
    super('conflict needs picker resolution');
  }
}
```

- [ ] **Step 2: pipeline 返回 conflicts 时，convertText 改抛 error**

在 `handleConvertText` 里：

```ts
if (result.conflicts && result.conflicts.length > 0) {
  throw new ConflictNeedsResolutionError(result.conflicts);
}
```

server.ts 的错误通道里把 `e.conflicts` 塞到 `data.conflicts`：

```ts
return { isError: true, content: [{ type: 'text', text: JSON.stringify({ code, message: e.message, conflicts: e.conflicts }) }] };
```

- [ ] **Step 3: 测试**

Create `tests/mcp/tool-convert-text-picker.test.ts`（fixture 里 locales/zh.json 预置两条相同 text 的 key）：

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// 复用 Task 22 的 writeFixture，但把 zh.json 预置成:
//   { "I18N.x": "添加", "I18N.y": "添加" }
// 并把源文件改为: const x = "添加";

describe('picker conflict flow', () => {
  let root: string;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-fast-picker-'));
    // ...写 fixture（同 Task 22，只替换 zh.json 和源文件）
    transport = new StdioClientTransport({
      command: 'node',
      args: [path.resolve(__dirname, '../../dist/mcp-server.js'), '--workspace', root]
    });
    client = new Client({ name: 'test', version: '0' }, { capabilities: {} });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('第一轮返 CONFLICT_NEEDS_RESOLUTION 和 conflicts', async () => {
    const filePath = path.join(root, 'src/a.ts');
    const content = await fs.readFile(filePath, 'utf-8');
    const res = await client.callTool({
      name: 'convert_text',
      arguments: { files: [{ path: filePath, content }], conflict_policy: 'picker' }
    });
    expect(res.isError).toBe(true);
    const payload = JSON.parse((res.content[0] as any).text);
    expect(payload.code).toBe('CONFLICT_NEEDS_RESOLUTION');
    expect(Array.isArray(payload.conflicts)).toBe(true);
    expect(payload.conflicts[0].candidates.map((c: any) => c.key)).toEqual(expect.arrayContaining(['I18N.x', 'I18N.y']));
  });

  it('第二轮带 picker_resolutions 成功', async () => {
    const filePath = path.join(root, 'src/a.ts');
    const content = await fs.readFile(filePath, 'utf-8');
    // 先拿到 group id
    const r1 = await client.callTool({
      name: 'convert_text',
      arguments: { files: [{ path: filePath, content }], conflict_policy: 'picker' }
    });
    const p1 = JSON.parse((r1.content[0] as any).text);
    const groupId = p1.conflicts[0].groupId;

    const r2 = await client.callTool({
      name: 'convert_text',
      arguments: {
        files: [{ path: filePath, content }],
        conflict_policy: 'picker',
        picker_resolutions: { [groupId]: 'reuse:I18N.x' }
      }
    });
    expect(r2.isError).toBeFalsy();
    const p2 = JSON.parse((r2.content[0] as any).text);
    expect(p2.source_patches[0].unified_diff).toContain("t('I18N.x')");
  });
});
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm run build:mcp && pnpm run test tests/mcp/tool-convert-text-picker.test.ts
git add -A && git commit -m "feat(mcp): two-round picker conflict flow"
```

---

### Task 24: 实现 `list_i18n_entries` tool

**Files:**
- Create: `src/mcp/tools/listI18nEntries.ts`, `tests/mcp/tool-list-i18n.test.ts`
- Modify: `src/mcp/server.ts`

- [ ] **Step 1: 写 handler**

```ts
import type { McpRuntime } from '../runtime';
import { ensureI18nLoaded } from '../runtime';

export const listI18nEntriesSchema = {
  name: 'list_i18n_entries',
  description: '分页倾倒 i18n 索引。',
  inputSchema: {
    type: 'object',
    properties: {
      locale: { type: 'string' },
      limit: { type: 'number', default: 200 },
      offset: { type: 'number', default: 0 }
    }
  }
} as const;

export async function handleListI18nEntries(rt: McpRuntime, args: { locale?: string; limit?: number; offset?: number }) {
  await ensureI18nLoaded(rt);
  return rt.cache.paginate({ locale: args.locale, limit: args.limit ?? 200, offset: args.offset ?? 0 });
}
```

- [ ] **Step 2: 挂到 server.ts 的 tools list + CallTool 分发**

```ts
// ListToolsRequestSchema 追加 listI18nEntriesSchema
// CallToolRequestSchema:
if (req.params.name === 'list_i18n_entries') {
  const result = await handleListI18nEntries(runtime, req.params.arguments as any);
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}
```

- [ ] **Step 3: 测试**

Create `tests/mcp/tool-list-i18n.test.ts`（复用 Task 20 的 `writeFixture`，但 zh.json 里塞 3 条）：

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('list_i18n_entries tool', () => {
  let root: string;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-fast-list-'));
    await fs.mkdir(path.join(root, '.vscode'), { recursive: true });
    await fs.mkdir(path.join(root, 'locales'), { recursive: true });
    await fs.writeFile(path.join(root, 'locales/zh.json'), JSON.stringify({
      'I18N.a': '添加', 'I18N.b': '删除', 'I18N.c': '保存'
    }));
    await fs.writeFile(path.join(root, '.vscode/i18n-fast.hook.js'), `
      module.exports = { collectI18n(content, filePath) {
        const j = JSON.parse(content);
        const locale = (filePath.match(/([a-z]+)\\.json$/) || [])[1] || 'zh';
        return Object.entries(j).map(([key, text]) => ({ key, text, locale, filePath }));
      }};
    `);
    await fs.writeFile(path.join(root, '.vscode/settings.json'), JSON.stringify({
      'i18n-fast.hookFilePattern': '.vscode/i18n-fast.hook.js',
      'i18n-fast.i18nFilePattern': 'locales/*.json'
    }));
    transport = new StdioClientTransport({
      command: 'node',
      args: [path.resolve(__dirname, '../../dist/mcp-server.js'), '--workspace', root]
    });
    client = new Client({ name: 'test', version: '0' }, { capabilities: {} });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('默认分页返 total 和 entries', async () => {
    const res = await client.callTool({ name: 'list_i18n_entries', arguments: { locale: 'zh' } });
    const p = JSON.parse((res.content[0] as any).text);
    expect(p.total).toBe(3);
    expect(p.entries).toHaveLength(3);
  });

  it('limit + offset 分页', async () => {
    const res = await client.callTool({ name: 'list_i18n_entries', arguments: { locale: 'zh', limit: 2, offset: 1 } });
    const p = JSON.parse((res.content[0] as any).text);
    expect(p.total).toBe(3);
    expect(p.entries).toHaveLength(2);
  });
});
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm run build:mcp && pnpm run test tests/mcp/tool-list-i18n.test.ts
git add -A && git commit -m "feat(mcp): implement list_i18n_entries tool"
```

---

### Task 25: 实现 `undo` tool

**Files:**
- Create: `src/mcp/tools/undo.ts`, `tests/mcp/tool-undo.test.ts`
- Modify: `src/mcp/server.ts`

- [ ] **Step 1: 写 handler**

```ts
import type { McpRuntime } from '../runtime';

export const undoSchema = {
  name: 'undo',
  description: '按 undo_token 回滚 MCP 直写的 i18n 文件；不传 token 则回退最近一次。',
  inputSchema: {
    type: 'object',
    properties: { undo_token: { type: 'string' } }
  }
} as const;

export async function handleUndo(rt: McpRuntime, args: { undo_token?: string }) {
  const records = rt.snapshots.undo(args.undo_token);
  if (!records) return { reverted_files: [] };
  for (const r of records) {
    await rt.host.writeFile(r.path, r.content);
  }
  return { reverted_files: records.map((r) => r.path) };
}
```

- [ ] **Step 2: 挂到 server.ts 的 tools list + CallTool 分发**

```ts
if (req.params.name === 'undo') {
  const result = await handleUndo(runtime, req.params.arguments as any);
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}
```

- [ ] **Step 3: 测试**

Create `tests/mcp/tool-undo.test.ts`（复用 Task 22 的 writeFixture）：

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('undo tool', () => {
  let root: string;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-fast-undo-'));
    // 复用 Task 22 的 writeFixture(root)
    transport = new StdioClientTransport({
      command: 'node',
      args: [path.resolve(__dirname, '../../dist/mcp-server.js'), '--workspace', root]
    });
    client = new Client({ name: 'test', version: '0' }, { capabilities: {} });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('convert → undo 让 zh.json 回到原状', async () => {
    const zhPath = path.join(root, 'locales/zh.json');
    const before = await fs.readFile(zhPath, 'utf-8');

    const filePath = path.join(root, 'src/a.ts');
    const content = await fs.readFile(filePath, 'utf-8');
    const r1 = await client.callTool({ name: 'convert_text', arguments: { files: [{ path: filePath, content }] } });
    const p1 = JSON.parse((r1.content[0] as any).text);
    expect(p1.undo_token).toBeDefined();

    const r2 = await client.callTool({ name: 'undo', arguments: { undo_token: p1.undo_token } });
    const p2 = JSON.parse((r2.content[0] as any).text);
    expect(p2.reverted_files).toContain(zhPath);

    const after = await fs.readFile(zhPath, 'utf-8');
    expect(after).toBe(before);
  });

  it('未知 token 返空数组', async () => {
    const r = await client.callTool({ name: 'undo', arguments: { undo_token: 'snap_nope' } });
    const p = JSON.parse((r.content[0] as any).text);
    expect(p.reverted_files).toEqual([]);
  });
});
```

- [ ] **Step 4: Commit**

```bash
pnpm run build:mcp && pnpm run test tests/mcp/tool-undo.test.ts
git add -A && git commit -m "feat(mcp): implement undo tool"
```

---

### Task 26: 打磨错误消息（带 hook 行号）

**Files:**
- Modify: `src/mcp/vscodeShim.ts`（UnsupportedInMcpError 增强 stack 解析）
- Modify: `src/mcp/server.ts`（统一错误响应里附 `hook_location`）

- [ ] **Step 1: UnsupportedInMcpError 解析 stack**

```ts
function locateHookFrame(stack: string): { file: string; line: number } | undefined {
  for (const line of stack.split('\n')) {
    const m = line.match(/\((.+?\.hook\.js):(\d+):/);
    if (m) return { file: m[1], line: Number(m[2]) };
  }
  return undefined;
}

export class UnsupportedInMcpError extends Error {
  readonly code = 'UNSUPPORTED_IN_MCP';
  hookLocation?: { file: string; line: number };
  constructor(public readonly api: string) {
    super(`vscode.${api} is not available in MCP mode.`);
    this.hookLocation = locateHookFrame(this.stack ?? '');
  }
}
```

- [ ] **Step 2: 错误响应里附 hook_location**

在 server.ts 错误通道里：

```ts
const payload: any = { code, message: e.message };
if (e.hookLocation) payload.hook_location = e.hookLocation;
if (e.conflicts) payload.conflicts = e.conflicts;
return { isError: true, content: [{ type: 'text', text: JSON.stringify(payload) }] };
```

- [ ] **Step 3: 测试**

fixture hook 故意调 `require('vscode').window.showQuickPick([])`，断言错误里有 `hook_location.file` 和 `line`。

- [ ] **Step 4: Commit**

```bash
pnpm run test && git add -A && git commit -m "feat(mcp): include hook file/line in UnsupportedInMcpError responses"
```

---

### Task 27: README / 配置示例 / hook 迁移指南

**Files:**
- Create: `docs/mcp/README.md`, `docs/mcp/migration.md`, `docs/mcp/claude-code-config-example.json`
- Modify: `README.md`, `README.zh-cn.md`（加 MCP 章节链接）

- [ ] **Step 1: 写 docs/mcp/README.md**

覆盖：如何从源码构建 MCP server、在 Claude Code / Cursor 里注册配置、四个 tool 的输入输出样例、错误码表。

- [ ] **Step 2: 写 docs/mcp/migration.md**

覆盖：老 hook 如何过渡到新 `ctx.host` API；哪些 vscode API 在 MCP 下会抛错；兼容层行为。

- [ ] **Step 3: 写 claude-code-config-example.json**

```json
{
  "mcpServers": {
    "i18n-fast": {
      "command": "node",
      "args": ["/absolute/path/to/vscode-i18n-fast/dist/mcp-server.js", "--workspace", "${workspaceFolder}"]
    }
  }
}
```

- [ ] **Step 4: 在主 README 加一段 MCP 介绍**

30-50 字，指向 `docs/mcp/README.md`。

- [ ] **Step 5: Commit**

```bash
git add docs/mcp/ README.md README.zh-cn.md
git commit -m "docs(mcp): add MCP server README, config example, migration guide"
```

---

### Task 28: 端到端 fixture + 集成测试

**Files:**
- Create: `tests/e2e/fixtures/vue-project/{package.json, src/FooBar.vue, locales/zh.json, .vscode/{settings.json, i18n-fast.hook.js}}`
- Create: `tests/e2e/full-flow.test.ts`

- [ ] **Step 1: 准备 fixture**

`src/FooBar.vue` 里含一段 `<template>添加用户</template>` 和一个既存的 `<template>删除</template>`（映射到 `locales/zh.json` 里的 `I18N.delete`）。

hook 实现：match 走 `matchChinese`；convert 用 pinyin 生成 key；write 追加到 `locales/zh.json`；collectI18n 解析 JSON。

- [ ] **Step 2: 写端到端测试**

Create `tests/e2e/full-flow.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function copyDir(src: string, dst: string) {
  await fs.mkdir(dst, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

describe('e2e: convert → query → undo', () => {
  let root: string;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-fast-e2e-'));
    await copyDir(path.resolve(__dirname, 'fixtures/vue-project'), root);
    transport = new StdioClientTransport({
      command: 'node',
      args: [path.resolve(__dirname, '../../dist/mcp-server.js'), '--workspace', root]
    });
    client = new Client({ name: 'test', version: '0' }, { capabilities: {} });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('全链路', async () => {
    // 1. query: 未命中
    let r = await client.callTool({ name: 'query_i18n', arguments: { text: '添加用户' } });
    expect(JSON.parse((r.content[0] as any).text).hits).toHaveLength(0);

    // 2. convert
    const fPath = path.join(root, 'src/FooBar.vue');
    const content = await fs.readFile(fPath, 'utf-8');
    r = await client.callTool({ name: 'convert_text', arguments: { files: [{ path: fPath, content }] } });
    const convertPayload = JSON.parse((r.content[0] as any).text);
    expect(convertPayload.source_patches).toHaveLength(1);
    expect(convertPayload.undo_token).toMatch(/^snap_/);
    const token = convertPayload.undo_token;

    // 3. query: 命中
    r = await client.callTool({ name: 'query_i18n', arguments: { text: '添加用户' } });
    expect(JSON.parse((r.content[0] as any).text).hits.length).toBeGreaterThan(0);

    // 4. undo
    r = await client.callTool({ name: 'undo', arguments: { undo_token: token } });
    expect(JSON.parse((r.content[0] as any).text).reverted_files.length).toBeGreaterThan(0);

    // 5. query: 再次未命中
    r = await client.callTool({ name: 'query_i18n', arguments: { text: '添加用户' } });
    expect(JSON.parse((r.content[0] as any).text).hits).toHaveLength(0);
  });
});
```

- [ ] **Step 3: 跑测试**

```bash
pnpm run build:mcp && pnpm run test tests/e2e/full-flow.test.ts
```
Expected: 全部 passed。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test(e2e): full convert → query → undo fixture flow"
```

---

### Task 29: VS Code 插件回归 + 发布前清查

**Files:**
- 无新文件；只跑测试和人工验证

- [ ] **Step 1: VS Code Extension Test**

```bash
pnpm run build:vscode
```
在 Extension Development Host 里跑：
- Cmd+Alt+C 转换中文 → 检查 diff 正确、i18n 文件更新
- Cmd+Alt+V 从剪贴板粘贴转换
- Cmd+Alt+B 撤销
- Hover 到已有 key → 原文 tooltip
- Ctrl+Click key → 跳转定义

- [ ] **Step 2: 运行全部单测 + 契约测 + e2e**

```bash
pnpm run test
```
Expected: 全部绿。

- [ ] **Step 3: lint**

```bash
pnpm run lint
```

- [ ] **Step 4: 版本 bump + CHANGELOG**

改 `package.json` `"version"` 为 `"0.1.0"`；`CHANGELOG.md` 加条目（本次变更：新增 MCP server）。

- [ ] **Step 5: Commit + 打 tag（手动，不自动推）**

```bash
git add -A && git commit -m "chore(release): 0.1.0 — MCP server"
git tag v0.1.0
```

**不自动 push**。用户决定何时 `git push origin feature-mcp-server --tags` 和是否发 marketplace。

---

## Self-Review 对照 spec 的覆盖

- **Spec §2 架构总览** → Tasks 1-3（目录 + ESLint + tsconfig + webpack MCP 入口在 Task 17）
- **Spec §3 Host 接口** → Task 8（接口）+ Task 9（VsCodeHost）+ Task 17（FsHost）
- **Spec §3 vscode shim** → Task 18
- **Spec §3 Hook Context 新格式** → Task 11
- **Spec §4 convert_text** → Tasks 15（pipeline）、21（diff）、22（tool）、23（picker 两轮）
- **Spec §4 query_i18n** → Task 20
- **Spec §4 list_i18n_entries** → Task 24
- **Spec §4 undo** → Task 25
- **Spec §4 错误模型** → Task 26（UNSUPPORTED_IN_MCP）、22（CONTENT_DRIFT）、19（HOOK_NOT_FOUND）、23（CONFLICT_NEEDS_RESOLUTION）、11（HOOK_TIMEOUT via HookTimeoutError）
- **Spec §5 数据流** → Task 15 + Task 16（snapshot 集成）+ Task 22
- **Spec §6.1 Hook 隔离** → Task 11（HookManager 超时）+ Task 12（热重载）
- **Spec §6.2 i18n 缓存** → Task 14
- **Spec §6.3 并发 / CONTENT_DRIFT** → Task 22
- **Spec §6.4 undo_token 生命周期** → Task 4（FileSnapshotStack）+ Task 16（record 包装）+ Task 25
- **Spec §6.5 路径安全** → Task 17 里的 `ensureInside`
- **Spec §6.6 picker 两轮** → Task 23
- **Spec §7 测试策略** → Task 3 + Task 28（e2e）+ 各个 handler 契约测试
- **Spec §8 分阶段** → 29 个 Task 覆盖完毕
- **Spec §9 仓库改动** → Tasks 1, 2, 5, 6, 7, 11, 14, 15 覆盖
