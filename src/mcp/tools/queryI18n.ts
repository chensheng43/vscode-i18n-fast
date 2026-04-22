import { ensureI18nLoaded } from '../runtime';

import type { McpRuntime } from '../runtime';

export async function handleQueryI18n(
  runtime: McpRuntime,
  args: { keys?: string[]; text?: string; locale?: string; exclude_keys?: string[] },
): Promise<{ hits: Array<{ key: string; locale: string; text: string; file: string }>; misses: string[] }> {
  await ensureI18nLoaded(runtime);
  const all = runtime.cache.all();
  const excluded = args.exclude_keys ? new Set(args.exclude_keys) : undefined;
  const hits: Array<{ key: string; locale: string; text: string; file: string }> = [];
  const misses: string[] = [];

  for (const key of args.keys ?? []) {
    if (excluded?.has(key)) continue;
    const matches = all.filter((entry) => entry.key === key && (!args.locale || entry.locale === args.locale));
    if (matches.length > 0) {
      for (const match of matches) {
        hits.push({ key: match.key, locale: match.locale, text: match.text, file: match.filePath });
      }
    } else {
      misses.push(key);
    }
  }

  if (args.text) {
    for (const match of all.filter((entry) => entry.text === args.text && (!args.locale || entry.locale === args.locale) && !excluded?.has(entry.key))) {
      hits.push({ key: match.key, locale: match.locale, text: match.text, file: match.filePath });
    }
  }

  return { hits, misses };
}
