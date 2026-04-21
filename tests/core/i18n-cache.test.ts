import { describe, expect, it } from 'vitest';

import { I18nCache } from '@core/i18n/cache';

describe('I18nCache', () => {
  it('queries by key, text, and locale', () => {
    const cache = new I18nCache();
    cache.replace([
      { key: 'I18N.a', text: '添加', locale: 'zh', filePath: '/w/locales/zh.json' },
      { key: 'I18N.a', text: 'Add', locale: 'en', filePath: '/w/locales/en.json' },
      { key: 'I18N.b', text: '删除', locale: 'zh', filePath: '/w/locales/zh.json' },
    ]);

    expect(cache.byKey('I18N.a')).toHaveLength(2);
    expect(cache.byText('添加')[0].locale).toBe('zh');

    const page = cache.paginate({ locale: 'zh', limit: 1, offset: 1 });
    expect(page.total).toBe(2);
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].key).toBe('I18N.b');
  });
});
