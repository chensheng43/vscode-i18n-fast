import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FsHost, PathOutsideWorkspaceError } from '@mcp/fsHost';

describe('FsHost', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-fast-fs-host-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('round-trips writes and reads', async () => {
    const host = new FsHost({ workspaceRoot: root });
    const filePath = path.join(root, 'a/b.json');
    await host.writeFile(filePath, '{"x":1}');
    expect(await host.readFile(filePath)).toBe('{"x":1}');
  });

  it('rejects writes outside the workspace', async () => {
    const host = new FsHost({ workspaceRoot: root });
    await expect(host.writeFile('/tmp/outside.json', 'x')).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
  });

  it('returns absolute file paths from findFiles', async () => {
    await fs.writeFile(path.join(root, 'a.json'), '{}');
    const host = new FsHost({ workspaceRoot: root });
    expect(await host.findFiles('*.json')).toEqual([path.join(root, 'a.json')]);
  });
});
