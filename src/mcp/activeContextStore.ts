import type { ActiveContext } from '@core/host';

let current: ActiveContext | undefined;

export function setActive(ctx: ActiveContext | undefined): void {
  current = ctx;
}

export function getActive(): ActiveContext | undefined {
  return current;
}
