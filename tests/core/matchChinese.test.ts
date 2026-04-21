import { describe, it, expect } from 'vitest';
import { matchChinese } from '@core/text/matchChinese';

describe('matchChinese', () => {
  it('抓取简单中文片段', () => {
    const hits = matchChinese('hello 添加用户 world');
    expect(hits).toHaveLength(1);
    expect(hits[0].text).toBe('添加用户');
    expect(hits[0].start).toBe(6);
    expect(hits[0].end).toBe(10);
  });

  it('忽略单行注释里的中文', () => {
    const hits = matchChinese('// 这是注释\nconst x = "真中文";');
    expect(hits.map((h) => h.text)).toEqual(['真中文']);
  });

  it('忽略多行注释里的中文', () => {
    const hits = matchChinese('/* 注释 */ "保留"');
    expect(hits.map((h) => h.text)).toEqual(['保留']);
  });

  it('保留标点穿插的中文短语', () => {
    const hits = matchChinese('"请输入，名称！"');
    expect(hits[0].text).toBe('请输入，名称！');
  });

  it('空字符串返空数组', () => {
    expect(matchChinese('')).toEqual([]);
  });
});
