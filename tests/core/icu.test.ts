import { describe, it, expect } from 'vitest';
import { parseIcuMessage, extractIcuPlaceholders } from '@core/text/icu';

describe('ICU', () => {
  it('抽取简单占位符', () => {
    expect(extractIcuPlaceholders('Hello {name}')).toEqual(['name']);
  });

  it('复数占位符', () => {
    expect(extractIcuPlaceholders('{count, plural, one {# item} other {# items}}'))
      .toContain('count');
  });

  it('解析无效 ICU 抛错', () => {
    expect(() => parseIcuMessage('Hello {')).toThrow();
  });
});
