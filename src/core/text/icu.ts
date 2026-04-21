/**
 * ICU MessageFormat parsing — strict path.
 *
 * Exports `parseIcuMessage` (strict pass-through to @formatjs parser) and
 * `extractIcuPlaceholders` (collects unique placeholder names). Parse errors
 * propagate — callers needing lenient behaviour should use
 * `getICUMessageFormatAST` in `src/vscode/utils.ts`, which passes
 * `ignoreTag` and `requiresOtherClause: false`.
 *
 * Collected element types: argument, number, date, time, select, plural.
 * Skipped: literal, pound (#), tag (walked into children).
 * Nested: plural/select options, tag children.
 *
 * TODO(future MCP task): return richer metadata (type, nested context)
 * once the MCP `convert_text` tool needs to validate placeholders against
 * the hook's convert output.
 */
import {
  parse,
  TYPE,
  isLiteralElement,
  isPoundElement,
  isTagElement,
  isPluralElement,
  isSelectElement
} from '@formatjs/icu-messageformat-parser';
import type { MessageFormatElement } from '@formatjs/icu-messageformat-parser';

/**
 * Strictly parses an ICU message to an AST.
 *
 * @throws if `input` is not valid ICU. For lenient parsing (matching legacy
 *   hook behaviour), use `getICUMessageFormatAST` in `src/vscode/utils.ts`.
 */
export function parseIcuMessage(input: string): MessageFormatElement[] {
  return parse(input);
}

/**
 * Walks an ICU AST and returns unique placeholder names in encounter order.
 *
 * Skips literal text and pound `#` nodes. Recurses into plural/select option
 * bodies and tag children. Tag names themselves are NOT collected — a
 * message like `<b>{name}</b>` yields `['name']`, not `['b']`.
 *
 * @throws if `input` is not valid ICU — propagated from `parseIcuMessage`.
 */
export function extractIcuPlaceholders(input: string): string[] {
  const ast = parseIcuMessage(input);
  const names = new Set<string>();
  const walk = (nodes: MessageFormatElement[]) => {
    for (const node of nodes) {
      if (isLiteralElement(node) || isPoundElement(node)) continue;
      if (isTagElement(node)) {
        walk(node.children);
        continue;
      }
      // Argument / Number / Date / Time / Select / Plural — all have .value: string
      // (typed via the library's BaseElement discriminated union).
      names.add(node.value);
      if (isPluralElement(node) || isSelectElement(node)) {
        for (const opt of Object.values(node.options)) {
          walk(opt.value);
        }
      }
    }
  };
  // Assert non-literal / non-pound types have a `value` string; use TYPE for
  // a compile-time sanity check that this enum is still part of the library API.
  void TYPE.literal;
  walk(ast);
  return Array.from(names);
}
