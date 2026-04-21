import { describe, expect, it } from 'vitest';

import { wrapHostForRecording } from '@core/snapshot/recordingHost';
import { FileSnapshotStack } from '@core/snapshot/fileSnapshotStack';

import type { Host } from '@core/host';

function memoryHost(initial: Record<string, string>): Host {
  const map = new Map(Object.entries(initial));
  return {
    mode: 'mcp',
    workspaceRoot: '/w',
    async readFile(filePath) {
      return map.get(filePath) ?? '';
    },
    async writeFile(filePath, content) {
      map.set(filePath, content);
    },
    async exists(filePath) {
      return map.has(filePath);
    },
    async findFiles() {
      return [];
    },
    watch() {
      return { dispose() {} };
    },
    getActiveContext() {
      return undefined;
    },
    log() {},
  };
}

describe('wrapHostForRecording', () => {
  it('records the previous file content before writes', async () => {
    const inner = memoryHost({ '/w/a.json': '{"x":1}' });
    const snapshots = new FileSnapshotStack();
    snapshots.next();
    const traces: Array<{ path: string; bytes_changed: number }> = [];
    const wrapped = wrapHostForRecording(inner, snapshots, traces);

    await wrapped.writeFile('/w/a.json', '{"x":2}');
    const token = snapshots.seal();

    expect(traces[0].path).toBe('/w/a.json');
    expect(traces[0].bytes_changed).toBe(0);
    expect(snapshots.undo(token)?.[0].content).toBe('{"x":1}');
  });
});
