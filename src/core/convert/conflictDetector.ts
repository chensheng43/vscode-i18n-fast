import type { I18nCache } from '../i18n/cache';
import type { ConflictPolicy, ConvertGroup } from '../types';

export interface ConflictCandidate {
  key: string;
  text: string;
  score: number;
}

export interface ConflictReport {
  groupId: string;
  originalText: string;
  candidates: ConflictCandidate[];
  resolution?: string;
}

export function detectConflicts(
  groups: ConvertGroup[],
  cache: I18nCache,
  opts: { policy: ConflictPolicy; resolutions: Record<string, string> },
): ConflictReport[] {
  return groups.map((group) => {
    const hits = cache.byText(group.originalText);
    const candidates = hits.map((hit) => ({
      key: hit.key,
      text: hit.text,
      score: 1,
    }));
    const preset = opts.resolutions[group.id];

    if (preset) {
      return {
        groupId: group.id,
        originalText: group.originalText,
        candidates,
        resolution: preset,
      };
    }

    if (hits.length === 0) {
      return {
        groupId: group.id,
        originalText: group.originalText,
        candidates,
        resolution: 'new',
      };
    }

    switch (opts.policy) {
      case 'reuse':
        return {
          groupId: group.id,
          originalText: group.originalText,
          candidates,
          resolution: `reuse:${hits[0].key}`,
        };
      case 'ignore':
        return {
          groupId: group.id,
          originalText: group.originalText,
          candidates,
          resolution: 'new',
        };
      case 'smart':
        return {
          groupId: group.id,
          originalText: group.originalText,
          candidates,
          resolution: hits.length === 1 ? `reuse:${hits[0].key}` : undefined,
        };
      case 'picker':
      default:
        return {
          groupId: group.id,
          originalText: group.originalText,
          candidates,
        };
    }
  });
}
