import { extractIcuPlaceholders, parseIcuMessage } from '../text/icu';
import { isInJsxElement } from '../text/jsx';
import { matchChinese } from '../text/matchChinese';

import type { Host } from '../host';
import type { HookContext, HookUtils } from './types';

export function createUtils(extras: Record<string, unknown> = {}): HookUtils {
  return {
    matchChinese,
    isInJsxElement,
    parseIcuMessage,
    extractIcuPlaceholders,
    ...extras,
  };
}

export function createHookContext(params: {
  host: Host;
  utilExtras?: Record<string, unknown>;
  config: unknown;
  legacyBindings?: Record<string, unknown>;
}): HookContext & Record<string, unknown> {
  return {
    ...(params.legacyBindings ?? {}),
    host: params.host,
    active: params.host.getActiveContext(),
    util: createUtils(params.utilExtras),
    config: params.config,
  };
}
