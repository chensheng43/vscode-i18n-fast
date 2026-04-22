import { createTwoFilesPatch } from 'diff';

import type { Host } from '../host';
import type { ConvertGroup } from '../types';

export interface SourcePatch {
  path: string;
  unified_diff: string;
}

export async function buildDiff(
  host: Host,
  groups: ConvertGroup[],
  beforeSnapshots?: ReadonlyMap<string, string>,
): Promise<SourcePatch[]> {
  const byFile = new Map<string, ConvertGroup[]>();
  for (const group of groups) {
    if (!group.replacementText) {
      continue;
    }
    const fileGroups = byFile.get(group.filePath) ?? [];
    fileGroups.push(group);
    byFile.set(group.filePath, fileGroups);
  }

  const patches: SourcePatch[] = [];
  for (const [filePath, fileGroups] of byFile.entries()) {
    const original = beforeSnapshots?.get(filePath) ?? await host.readFile(filePath);
    let next: string;
    if (beforeSnapshots?.has(filePath)) {
      next = await host.readFile(filePath);
    } else {
      next = original;
      for (const group of fileGroups.slice().sort((a, b) => b.range.start - a.range.start)) {
        next = next.slice(0, group.range.start) + group.replacementText + next.slice(group.range.end);
      }
    }
    if (original !== next) {
      patches.push({
        path: filePath,
        unified_diff: createTwoFilesPatch(filePath, filePath, original, next, '', '', { context: 3 }),
      });
    }
  }

  return patches;
}
