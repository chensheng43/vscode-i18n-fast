import { describe, it, expect } from 'vitest';
import { isInJsxElement } from '@core/text/jsx';

describe('isInJsxElement', () => {
  it('JSX 元素内的文本返回 true', () => {
    const src = 'const x = <div>添加用户</div>;';
    const offset = src.indexOf('添加用户');
    expect(isInJsxElement(src, offset)).toBe(true);
  });

  it('字符串字面量里的中文返回 false', () => {
    const src = 'const x = "添加用户";';
    const offset = src.indexOf('添加用户');
    expect(isInJsxElement(src, offset)).toBe(false);
  });

  it('JSX attribute 值内返 false（由 AST 区分）', () => {
    const src = 'const x = <div title="提示">x</div>;';
    const offset = src.indexOf('提示');
    expect(isInJsxElement(src, offset)).toBe(false);
  });

  it('JSXFragment 内的文本返回 true', () => {
    const src = 'const x = <>添加用户</>;';
    expect(isInJsxElement(src, src.indexOf('添加用户'))).toBe(true);
  });
});
