import type { ActiveContext, Disposable, Host } from '../host';
import type { FileSnapshotStack } from './fileSnapshotStack';

export interface WriteTrace {
  path: string;
  bytes_changed: number;
}

export function wrapHostForRecording(
  inner: Host,
  snapshots: FileSnapshotStack,
  traces: WriteTrace[],
): Host {
  return {
    get mode() {
      return inner.mode;
    },
    get workspaceRoot() {
      return inner.workspaceRoot;
    },
    readFile: (p) => inner.readFile(p),
    exists: (p) => inner.exists(p),
    findFiles: (include, exclude) => inner.findFiles(include, exclude),
    watch: (glob, onChange) => inner.watch(glob, onChange),
    getActiveContext: () => inner.getActiveContext(),
    log: (level, msg) => inner.log(level, msg),
    async writeFile(absPath: string, content: string): Promise<void> {
      const before = (await inner.exists(absPath)) ? await inner.readFile(absPath) : '';
      snapshots.record(absPath, before);
      await inner.writeFile(absPath, content);
      traces.push({
        path: absPath,
        bytes_changed: Buffer.byteLength(content, 'utf-8') - Buffer.byteLength(before, 'utf-8'),
      });
    },
  };
}

export function cloneActiveContext(ctx: ActiveContext | undefined): ActiveContext | undefined {
  if (!ctx) {
    return undefined;
  }
  return {
    ...ctx,
    selections: ctx.selections?.map((selection) => ({ ...selection })),
  };
}
