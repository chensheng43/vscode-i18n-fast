export interface ConvertGroup {
  id: string;
  filePath: string;
  range: { start: number; end: number };
  originalText: string;
  key?: string;
  replacementText?: string;
}

export interface I18nEntry {
  readonly key: string;
  readonly text: string;
  readonly locale: string;
  readonly filePath: string;
  readonly line?: number;
}

export type ConflictPolicy = 'reuse' | 'ignore' | 'picker' | 'smart';

/**
 * Config surface used by core modules. The four declared fields are the
 * stable schema. The index signature admits hook-supplied extension keys
 * (passed through to user hooks opaquely), without forcing each added key
 * to be declared here.
 */
export interface ResolvedConfig {
  readonly hookFilePattern: string;
  readonly i18nFilePattern: string;
  readonly conflictPolicy: ConflictPolicy;
  readonly autoMatchChinese: boolean;
  readonly [key: string]: unknown;
}
