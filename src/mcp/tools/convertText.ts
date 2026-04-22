import * as path from 'node:path';

import { runConvert } from '@core/convert/pipeline';
import type { ActiveContext, Host } from '@core/host';

import { buildDocumentShim } from '../documentShim';
import { ConflictNeedsResolutionError, ContentDriftError } from '../errors';
import { ensureHookLoaded, ensureI18nLoaded } from '../runtime';
import { buildMatchChinese, buildWriteFileByEditor } from '../utilShims';

import type { McpRuntime } from '../runtime';

function scopeHost(host: Host, activeContext: ActiveContext): Host {
  return Object.create(host, {
    getActiveContext: { value: () => activeContext },
  }) as Host;
}

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
  if (!(await runtime.host.exists(absPath))) {
    throw new ContentDriftError(absPath);
  }
  const normalize = (s: string) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const onDisk = normalize(await runtime.host.readFile(absPath));
  if (onDisk !== normalize(file.content)) {
    throw new ContentDriftError(absPath);
  }

  const host = scopeHost(runtime.host, {
    filePath: absPath,
    content: file.content,
    selections: file.selections,
  });

  const contentRef = { value: file.content };
  const document = buildDocumentShim(absPath, contentRef);
  const legacyContext = {
    document,
    writeFileByEditor: buildWriteFileByEditor(() => runtime.hookManager.effectiveHost, absPath, contentRef),
    matchChinese: buildMatchChinese(),
  };

  runtime.hookManager.pushHostOverride(host);
  try {
    const result = await runConvert({
      host,
      hookManager: runtime.hookManager,
      snapshots: runtime.snapshots,
      i18nCache: runtime.cache,
    }, {
      conflictPolicy: args.conflict_policy ?? runtime.readConfig().conflictPolicy,
      pickerResolutions: args.picker_resolutions,
      legacyContext,
    });
    if (result.conflicts && result.conflicts.length > 0) {
      throw new ConflictNeedsResolutionError(result.conflicts);
    }
    return result;
  } finally {
    runtime.hookManager.popHostOverride();
  }
}
