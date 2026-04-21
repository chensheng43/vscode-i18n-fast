import type { McpRuntime } from '../runtime';

export async function handleUndo(runtime: McpRuntime, args: { undo_token?: string }) {
  const records = runtime.snapshots.undo(args.undo_token);
  if (!records) {
    return { reverted_files: [] };
  }

  for (const record of records) {
    await runtime.host.writeFile(record.path, record.content);
  }

  return { reverted_files: records.map((record) => record.path) };
}
