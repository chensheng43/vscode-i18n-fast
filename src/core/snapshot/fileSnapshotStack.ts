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
