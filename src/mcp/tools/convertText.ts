import * as path from 'node:path';

import { runConvert } from '@core/convert/pipeline';

import { setActive } from '../activeContextStore';
import { ConflictNeedsResolutionError, ContentDriftError } from '../errors';
import { ensureHookLoaded, ensureI18nLoaded } from '../runtime';

import type { McpRuntime } from '../runtime';

export async function handleConvertText(runtime: McpRuntime, args: {
  files: Array<{ path: string; content: string; selections?: Array<{ start: number; end: number }> }>;
  conflict_policy?: 'reuse' | 'ignore' | 'picker' | 'smart';
  picker_resolutions?: Record<string, string>;
}) {
  await ensureHookLoaded(runtime);
  await ensureI18nLoaded(runtime);

  if (args.files.length !== 1) {
    throw new Error('convert_text currently supports exactly one file');
  }

  const [file] = args.files;
  const absPath = path.isAbsolute(file.path) ? file.path : path.resolve(runtime.host.workspaceRoot, file.path);
  const onDisk = await runtime.host.readFile(absPath);
  if (onDisk !== file.content) {
    throw new ContentDriftError(absPath);
  }

  setActive({
    filePath: absPath,
    content: file.content,
    selections: file.selections,
  });

  try {
    const result = await runConvert({
      host: runtime.host,
      hookManager: runtime.hookManager,
      snapshots: runtime.snapshots,
      i18nCache: runtime.cache,
    }, {
      conflictPolicy: args.conflict_policy ?? runtime.readConfig().conflictPolicy,
      pickerResolutions: args.picker_resolutions,
    });
    if (result.conflicts && result.conflicts.length > 0) {
      throw new ConflictNeedsResolutionError(result.conflicts);
    }
    return result;
  } finally {
    setActive(undefined);
  }
}
