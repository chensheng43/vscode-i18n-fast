import { ensureI18nLoaded } from '../runtime';

import type { McpRuntime } from '../runtime';

export async function handleListI18nEntries(
  runtime: McpRuntime,
  args: { locale?: string; limit?: number; offset?: number },
) {
  await ensureI18nLoaded(runtime);
  return runtime.cache.paginate({
    locale: args.locale,
    limit: args.limit ?? 200,
    offset: args.offset ?? 0,
  });
}
