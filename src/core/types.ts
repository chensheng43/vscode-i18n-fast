export interface ConvertGroup {
  id: string;
  filePath: string;
  range: { start: number; end: number };
  originalText: string;
  key?: string;
  replacementText?: string;
  matched?: { keyIfReuse?: string; candidates?: Array<{ key: string; text: string }> };
}

export interface I18nEntry {
  key: string;
  text: string;
  locale: string;
  filePath: string;
  line?: number;
}

export type ConflictPolicy = 'reuse' | 'ignore' | 'picker' | 'smart';

export interface ResolvedConfig {
  hookFilePattern: string;
  i18nFilePattern: string;
  conflictPolicy: ConflictPolicy;
  autoMatchChinese: boolean;
  [key: string]: unknown;
}
