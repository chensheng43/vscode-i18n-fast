import { describe, expect, it } from 'vitest';

import { detectConflicts } from '@core/convert/conflictDetector';
import { I18nCache } from '@core/i18n/cache';

function cacheWith(entries: Array<{ key: string; text: string }>) {
  const cache = new I18nCache();
  cache.replace(entries.map((entry) => ({ ...entry, locale: 'zh', filePath: '/w/locales/zh.json' })));
  return cache;
}

const group = (id: string, originalText: string) => ({
  id,
  filePath: '/w/src/a.ts',
  range: { start: 0, end: originalText.length },
  originalText,
});

describe('detectConflicts', () => {
  it('reuses the only exact smart match', () => {
    const reports = detectConflicts([group('1', '添加')], cacheWith([{ key: 'I18N.a', text: '添加' }]), {
      policy: 'smart',
      resolutions: {},
    });
    expect(reports[0].resolution).toBe('reuse:I18N.a');
  });

  it('leaves multiple smart matches unresolved', () => {
    const reports = detectConflicts([group('1', '添加')], cacheWith([
      { key: 'I18N.a', text: '添加' },
      { key: 'I18N.b', text: '添加' },
    ]), {
      policy: 'smart',
      resolutions: {},
    });
    expect(reports[0].resolution).toBeUndefined();
  });

  it('honors an explicit picker resolution', () => {
    const reports = detectConflicts([group('1', '添加')], cacheWith([{ key: 'I18N.a', text: '添加' }]), {
      policy: 'picker',
      resolutions: { '1': 'new' },
    });
    expect(reports[0].resolution).toBe('new');
  });

  it('returns new when no hit exists', () => {
    const reports = detectConflicts([group('1', '新词')], cacheWith([]), {
      policy: 'smart',
      resolutions: {},
    });
    expect(reports[0].resolution).toBe('new');
  });
});
