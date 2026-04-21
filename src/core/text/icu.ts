/**
 * Pure (VS Code-free) ICU MessageFormat parsing helpers.
 *
 * Thin wrapper over `@formatjs/icu-messageformat-parser`:
 * - `parseIcuMessage` exposes the parser with default options so call sites
 *   share a single entry point. It propagates parse errors so invalid input
 *   is surfaced rather than silently swallowed.
 * - `extractIcuPlaceholders` walks the resulting AST and collects the
 *   placeholder names (argument / plural / select / number / date / time /
 *   tag nodes — everything with a `value: string` that isn't a plain
 *   literal, `type === 0`).
 *
 * NOTE: this core module intentionally avoids the legacy `ignoreTag` /
 * `requiresOtherClause` flags used by `src/vscode/utils.ts :: getICUMessageFormatAST`.
 * The VS Code side keeps its own wrapper with those flags; this module is the
 * clean, strict variant future consumers (the MCP server, other tooling) can
 * rely on.
 *
 * TODO(future MCP task): if the MCP server needs placeholder metadata beyond
 * names (e.g. plural keys, nested structure), extend the walker here rather
 * than duplicating the traversal in call sites.
 */

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
