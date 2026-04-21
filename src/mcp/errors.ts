export class McpToolError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}

export class ContentDriftError extends Error {
  readonly code = 'CONTENT_DRIFT';

  constructor(public readonly path: string) {
    super(`file content on disk differs from provided content: ${path}`);
    this.name = 'ContentDriftError';
  }
}

export class ConflictNeedsResolutionError extends Error {
  readonly code = 'CONFLICT_NEEDS_RESOLUTION';

  constructor(public readonly conflicts: unknown[]) {
    super('conflict needs picker resolution');
    this.name = 'ConflictNeedsResolutionError';
  }
}
