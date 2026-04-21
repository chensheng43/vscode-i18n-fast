module.exports = {
  match(ctx) {
    const hits = ctx.util.matchChinese(ctx.active?.content ?? '');
    return hits.map((hit, index) => ({
      id: `g${index}`,
      filePath: ctx.active.filePath,
      range: { start: hit.start, end: hit.end },
      originalText: hit.text,
    }));
  },
  convert(groups) {
    return groups.map((group) => ({
      ...group,
      key: `I18N.auto.${group.id}`,
      replacementText: `t('I18N.auto.${group.id}')`,
    }));
  },
  async write(groups, ctx) {
    const localePath = `${ctx.host.workspaceRoot}/locales/zh.json`;
    let existing = {};
    if (await ctx.host.exists(localePath)) {
      existing = JSON.parse(await ctx.host.readFile(localePath));
    }
    for (const group of groups) {
      existing[group.key] = group.originalText;
    }
    await ctx.host.writeFile(localePath, JSON.stringify(existing, null, 2));
  },
  collectI18n(content, filePath) {
    try {
      const data = JSON.parse(content);
      const locale = (filePath.match(/([a-z-]+)\.json$/i) || [])[1] || 'zh';
      return Object.entries(data).map(([key, text]) => ({ key, text, locale, filePath }));
    } catch {
      return [];
    }
  },
};
