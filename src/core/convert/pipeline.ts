import { detectConflicts, type ConflictReport } from './conflictDetector';
import { buildDiff, type SourcePatch } from './diffBuilder';
import { wrapHostForRecording, type WriteTrace } from '../snapshot/recordingHost';

import type { HookManager } from '../hook/manager';
import type { Host } from '../host';
import type { I18nCache } from '../i18n/cache';
import type { FileSnapshotStack } from '../snapshot/fileSnapshotStack';
import type { ConflictPolicy, ConvertGroup } from '../types';

export interface ConvertPipelineDeps {
  host: Host;
  hookManager: HookManager;
  snapshots: FileSnapshotStack;
  i18nCache: I18nCache;
}

export interface ConvertRunOptions {
  conflictPolicy: ConflictPolicy;
  pickerResolutions?: Record<string, string>;
  legacyContext?: Record<string, unknown>;
  presetGroups?: ConvertGroup[];
  presetConvertedGroups?: ConvertGroup[];
}

export interface ConvertRunResult {
  source_patches: SourcePatch[];
  i18n_writes_applied: WriteTrace[];
  undo_token?: string;
  conflicts?: ConflictReport[];
  groups?: ConvertGroup[];
}

function applyResolutions(groups: ConvertGroup[], reports: ConflictReport[]): ConvertGroup[] {
  const byId = new Map(reports.map((report) => [report.groupId, report]));

  return groups.map((group) => {
    const report = byId.get(group.id);
    if (!report?.resolution || !report.resolution.startsWith('reuse:')) {
      return group;
    }

    const key = report.resolution.slice('reuse:'.length);
    return {
      ...group,
      key,
      replacementText: group.replacementText && group.key && group.key !== key
        ? group.replacementText.split(group.key).join(key)
        : group.replacementText,
    };
  });
}

export async function runConvert(
  deps: ConvertPipelineDeps,
  opts: ConvertRunOptions,
): Promise<ConvertRunResult> {
  const matched = opts.presetGroups ?? await deps.hookManager.match(opts.legacyContext);
  if (matched.length === 0) {
    return { source_patches: [], i18n_writes_applied: [] };
  }

  const converted = opts.presetConvertedGroups ?? await deps.hookManager.convert(matched, opts.legacyContext);
  const conflicts = detectConflicts(converted, deps.i18nCache, {
    policy: opts.conflictPolicy,
    resolutions: opts.pickerResolutions ?? {},
  });
  const unresolved = conflicts.filter((report) => report.resolution === undefined);
  if (unresolved.length > 0) {
    return {
      source_patches: [],
      i18n_writes_applied: [],
      conflicts: unresolved,
      groups: converted,
    };
  }

  const finalized = applyResolutions(converted, conflicts);
  deps.snapshots.next();
  const traces: WriteTrace[] = [];
  const wrappedHost = wrapHostForRecording(deps.host, deps.snapshots, traces);

  deps.hookManager.pushHostOverride(wrappedHost);
  try {
    await deps.hookManager.write(finalized, opts.legacyContext);
  } finally {
    deps.hookManager.popHostOverride();
  }
  const undoToken = deps.snapshots.seal();

  return {
    source_patches: await buildDiff(deps.host, finalized),
    i18n_writes_applied: traces,
    undo_token: undoToken,
    groups: finalized,
  };
}
