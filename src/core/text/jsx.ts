/**
 * Pure (VS Code-free) JSX-context detection.
 *
 * Ports the behavioral intent of the legacy `isInJsxElement` helper from
 * `src/vscode/utils.ts`:
 * - Parse `source` with `@babel/parser` (jsx + typescript plugins,
 *   errorRecovery on) so partial / in-progress edits still walk.
 * - Walk the AST and report whether the given `offset` falls inside a
 *   `JSXElement` / `JSXFragment` children region (i.e. between the end of
 *   `openingElement` and the start of `closingElement`) or a `JSXText`
 *   node. Offsets inside a `JSXAttribute` value sit inside the opening
 *   element and therefore return `false`, matching the original semantics.
 *
 * Shape change vs. legacy:
 * - Legacy accepted `(string | Node, start, end)` returning `true` when the
 *   range was contained within a JSX children region. The pure port takes
 *   a raw string + single character offset, which is the shape the MCP
 *   server and future callers need. The vscode/ adapter preserves the old
 *   range-based signature by collapsing to `offset === start` and
 *   delegating — see `src/vscode/utils.ts`.
 *
 * TODO(future MCP task): once callers (hook.ts, user hook contexts) migrate
 * to the `(source, offset)` shape this module can drop the adapter in
 * `src/vscode/utils.ts` and be re-exported directly.
 */

import { parse } from '@babel/parser';
import traverseMod from '@babel/traverse';

import type { Node } from '@babel/types';

// `@babel/traverse` is a CJS module whose default export is the traverse
// function itself. Under Node16 module resolution with esModuleInterop off,
// the imported namespace may be the function OR wrap it under `.default`
// depending on the bundler — normalize here. This mirrors the pattern
// documented in the task spec and used elsewhere in the repo.
const traverse: typeof traverseMod = (traverseMod as any).default ?? traverseMod;

const parseAST = (source: string): Node => {
  return parse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
    errorRecovery: true,
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    allowSuperOutsideMethod: true,
    allowUndeclaredExports: true,
    allowAwaitOutsideFunction: true,
  });
};

/**
 * Returns `true` when `offset` falls inside the children region of a
 * JSXElement / JSXFragment (or directly inside a JSXText node), and
 * `false` when it sits inside a JSX attribute value, a string literal,
 * or plain JS.
 *
 * NOTE: the port preserves the legacy bounds semantics — inclusive on
 * both ends (`offset >= start && offset <= end`) so hits flush against a
 * delimiter (e.g. right before `<`) still count.
 */
export function isInJsxElement(source: string, offset: number): boolean {
  let ast: Node;
  try {
    ast = parseAST(source);
  } catch {
    // errorRecovery: true should cover most cases, but keep a belt-and-braces
    // guard so malformed input never throws up to callers.
    return false;
  }

  let inJsx = false;

  const checkJSXText = (node: { start?: number | null; end?: number | null }): boolean => {
    if (node.start == null || node.end == null) {
      return false;
    }
    return offset >= node.start && offset <= node.end;
  };

  const checkJSXChildren = (node: any): boolean => {
    const nodeStart = node?.openingElement?.end ?? node?.openingFragment?.end;
    const nodeEnd = node?.closingElement?.start ?? node?.closingFragment?.start;
    if (nodeStart == null || nodeEnd == null) {
      return false;
    }

    if (offset >= nodeStart && offset <= nodeEnd) {
      // 兼容 <div></div> 这种空标签
      if (!node.children || node.children.length === 0) {
        return true;
      }

      for (const child of node.children) {
        if (child.type === 'JSXText') {
          return checkJSXText(child);
        }
      }
    }

    return false;
  };

  traverse(ast, {
    JSXFragment({ node }) {
      if (checkJSXChildren(node)) {
        inJsx = true;
        return;
      }
    },
    JSXElement({ node }) {
      if (checkJSXChildren(node)) {
        inJsx = true;
        return;
      }
    },
    JSXText({ node }) {
      if (checkJSXText(node)) {
        inJsx = true;
        return;
      }
    },
  });

  return inJsx;
}
