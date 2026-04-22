declare const __non_webpack_require__: NodeRequire;

interface PositionLike {
  line: number;
  character: number;
}

interface RangeLike {
  start: PositionLike;
  end: PositionLike;
}

export interface ContentRef {
  value: string;
}

function computeLineStarts(content: string): number[] {
  const starts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}

export function buildDocumentShim(filePath: string, contentRef: ContentRef) {
  const vscode = __non_webpack_require__('vscode') as {
    Uri: { file(path: string): unknown };
    Position: new (line: number, character: number) => PositionLike;
  };

  let cachedContent = contentRef.value;
  let lineStarts = computeLineStarts(cachedContent);

  function sync() {
    if (contentRef.value !== cachedContent) {
      cachedContent = contentRef.value;
      lineStarts = computeLineStarts(cachedContent);
    }
  }

  const offsetAt = (position: PositionLike): number => {
    sync();
    const line = Math.max(0, Math.min(position.line, lineStarts.length - 1));
    return lineStarts[line] + position.character;
  };

  const positionAt = (offset: number): PositionLike => {
    sync();
    const clamped = Math.max(0, Math.min(offset, cachedContent.length));
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= clamped) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return new vscode.Position(lo, clamped - lineStarts[lo]);
  };

  return {
    uri: vscode.Uri.file(filePath),
    fileName: filePath,
    get lineCount() {
      sync();
      return lineStarts.length;
    },

    getText(range?: RangeLike): string {
      sync();
      if (!range) {
        return cachedContent;
      }
      const start = offsetAt(range.start);
      const end = offsetAt(range.end);
      return cachedContent.substring(start, end);
    },

    offsetAt,
    positionAt,
  };
}

export type DocumentShim = ReturnType<typeof buildDocumentShim>;
