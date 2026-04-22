import { ensureI18nLoaded } from '../runtime';

import type { McpRuntime } from '../runtime';

const MAX_LIMIT = 1000;

export async function handleListI18nEntries(
  runtime: McpRuntime,
  args: { locale?: string; limit?: number; offset?: number } = {},
) {
  await ensureI18nLoaded(runtime);

  const limit = args.limit ?? 200;
  const offset = args.offset ?? 0;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error('offset must be a non-negative integer');
  }

  return runtime.cache.paginate({
    locale: args.locale,
    limit,
    offset,
  });
}
