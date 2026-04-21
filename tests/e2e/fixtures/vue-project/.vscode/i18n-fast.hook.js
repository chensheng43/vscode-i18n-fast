const PINYIN = {
  '添': 'tian',
  '加': 'jia',
  '用': 'yong',
  '户': 'hu',
  '删': 'shan',
  '除': 'chu',
};

function toKey(text) {
  return `I18N.${Array.from(text).map((char) => PINYIN[char] || char).join('_')}`;
}

module.exports = {
  match(ctx) {
    const active = ctx.host.getActiveContext();
    const hits = ctx.util.matchChinese(active.content);
    return hits.map((hit, index) => ({
      id: `g${index}`,
      filePath: active.filePath,
      range: { start: hit.start, end: hit.end },
      originalText: hit.text,
    }));
  },

  convert(ctx) {
    return ctx.groups.map((group) => {
      const key = toKey(group.originalText);
      return {
        ...group,
        key,
        replacementText: `{{ t('${key}') }}`,
      };
    });
  },

  async write(ctx) {
    const localePath = `${ctx.host.workspaceRoot}/locales/zh.json`;
    const json = JSON.parse(await ctx.host.readFile(localePath));
    for (const group of ctx.groups) {
      if (!json[group.key]) {
        json[group.key] = group.originalText;
      }
    }
    await ctx.host.writeFile(localePath, `${JSON.stringify(json, null, 2)}\n`);
  },

  async collectI18n(ctx) {
    const content = await ctx.host.readFile(ctx.i18nFileUri.fsPath);
    const json = JSON.parse(content);
    return Object.entries(json).map(([key, value]) => ({
      key,
      value,
      locale: 'zh',
      filePath: ctx.i18nFileUri.fsPath,
    }));
  },
};
