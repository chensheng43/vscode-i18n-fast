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

  it('record() 在 next() 之前抛错', () => {
    expect(() => stack.record('/abs/a', 'x')).toThrow(/before next/);
  });

  it('seal() 在 next() 之前抛错', () => {
    expect(() => stack.seal()).toThrow(/before next/);
  });

  it('undo() 在空栈无 token 时返 undefined', () => {
    expect(stack.undo()).toBeUndefined();
  });

  it('clear() 重置 frames 和 open frame', () => {
    stack.next();
    stack.record('/abs/a', 'v');
    stack.clear();
    expect(stack.size()).toBe(0);
    expect(() => stack.seal()).toThrow(/before next/);
  });

  it('size() 不包含未 seal 的 open frame', () => {
    stack.next();
    stack.record('/abs/a', 'v');
    expect(stack.size()).toBe(0);
    stack.seal();
    expect(stack.size()).toBe(1);
  });
});
