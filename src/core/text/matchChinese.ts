/**
 * Pure (VS Code-free) Chinese text extractor.
 *
 * Ports the behavioral intent of the legacy `matchChinese` helper from
 * `src/vscode/utils.ts`:
 * - Skip text inside `<i18n>…</i18n>`, `<!-- … -->`, block comments and
 *   line comments.
 * - Merge adjacent runs of Han characters glued together by CJK punctuation
 *   (e.g. `请输入，名称！`) into a single hit.
 * - Return plain character offsets so this module stays decoupled from any
 *   editor/document type. Call sites that need VS Code `Range`s build them
 *   in the vscode/ adapter via `document.positionAt(offset)`.
 *
 * NOTE: the legacy helper also snapped hits to surrounding `'` / `"` / `` ` ``
 * quote delimiters and returned `ConvertGroup` objects. That bit lives at the
 * vscode/ boundary where the editor document is available; keeping it out of
 * core preserves the "pure function over a string" contract.
 *
 * TODO(task-6+): the MCP server will consume this directly; its options
 * surface (e.g. excluding custom tokens) should be added here rather than in
 * the vscode/ wrapper.
 */

export interface ChineseHit {
  /** Character offset, inclusive. */
  start: number;
  /** Character offset, exclusive. */
  end: number;
  /** The matched Chinese substring (including CJK punctuation extensions). */
  text: string;
}

export interface MatchChineseOptions {
  /** Extra literal substrings that, if present in a hit, cause it to be dropped (matches legacy `excludes`). */
  excludes?: string[];
}

const HAN_CHAR = /[\u4e00-\u9fa5]/;
// A Chinese segment: one or more Han characters, optionally extended through
// CJK punctuation runs (U+3000–U+303F symbols, U+FF00–U+FFEF full-width forms)
// so phrases like `请输入，名称！` stay together.
const CHINESE_SEGMENT = /[\u4e00-\u9fa5]+(?:[\u3000-\u303f\uff00-\uffef]+[\u4e00-\u9fa5]+)*[\u3000-\u303f\uff00-\uffef]*/g;

type Range = [number, number];

/** Legacy `getNotePositionList` port: find `[start, end]` spans of each comment marker pair. */
const collectCommentRanges = (text: string, startMark: string, endMark: string): Range[] => {
  const ranges: Range[] = [];
  if (!text) {
    return ranges;
  }
  let startIndex = -1;
  let endIndex = 0;
  while ((startIndex = text.indexOf(startMark, endIndex)) > -1) {
    const found = text.indexOf(endMark, startIndex + 1);
    // Mirror legacy behavior: if endMark missing, the returned pair has end = -1,
    // so the `start < i < end` guard below naturally skips it.
    endIndex = found === -1 ? text.length : found;
    ranges.push([startIndex, found === -1 ? -1 : found]);
    if (found === -1) break;
  }
  return ranges;
};

const collectAllCommentRanges = (text: string): Range[] => [
  ...collectCommentRanges(text, '<i18n>', '</i18n>'),
  ...collectCommentRanges(text, '<!--', '-->'),
  ...collectCommentRanges(text, '/*', '*/'),
  ...collectCommentRanges(text, '//', '\n'),
];

const isInsideAny = (ranges: Range[], index: number): boolean => {
  for (const [start, end] of ranges) {
    if (start < index && index < end) {
      return true;
    }
  }
  return false;
};

/**
 * Extract Chinese substrings from `text`, skipping content inside comments
 * and `<i18n>…</i18n>` blocks. Adjacent Han runs joined by CJK punctuation
 * are returned as a single hit.
 */
export function matchChinese(text: string, options: MatchChineseOptions = {}): ChineseHit[] {
  if (!text || !HAN_CHAR.test(text)) {
    return [];
  }

  const excludes = options.excludes ?? ['v-track:'];
  const commentRanges = collectAllCommentRanges(text);
  const hits: ChineseHit[] = [];

  // Reset regex state — CHINESE_SEGMENT is module-scoped and stateful under /g.
  CHINESE_SEGMENT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CHINESE_SEGMENT.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;
    const end = start + raw.length;

    if (isInsideAny(commentRanges, start)) {
      continue;
    }

    if (excludes.some((k) => raw.includes(k))) {
      continue;
    }

    hits.push({ start, end, text: raw });
  }

  return hits;
}
