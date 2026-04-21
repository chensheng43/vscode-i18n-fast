import type { Host } from '../host';
import type { ConvertGroup } from '../types';

export interface SourcePatch {
  path: string;
  unified_diff: string;
}

export async function buildDiff(_host: Host, _groups: ConvertGroup[]): Promise<SourcePatch[]> {
  return [];
}
