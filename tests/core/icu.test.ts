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

  it('rich-text tag 收集子占位符，不收集 tag 名', () => {
    expect(extractIcuPlaceholders('<b>{name}</b>')).toEqual(['name']);
  });

  it('select 语法收集 selector', () => {
    expect(extractIcuPlaceholders('{gender, select, male {He} female {She} other {They}}'))
      .toEqual(['gender']);
  });

  it('嵌套 plural 收集内外占位符', () => {
    const input = '{count, plural, one {{name} has one item} other {{name} has many}}';
    const names = extractIcuPlaceholders(input);
    expect(names).toContain('count');
    expect(names).toContain('name');
  });

  it('number/date/time 收集参数名', () => {
    expect(extractIcuPlaceholders('{amount, number} {when, date, short}'))
      .toEqual(expect.arrayContaining(['amount', 'when']));
  });
});
