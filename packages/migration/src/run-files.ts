import { hash, identity, type MigrationFile, type MigrationPlan } from "./model.js";

import type { ImportedFile, MigrationProgress, MigrationTarget } from "./run.js";
export async function commitFiles(
  plan: MigrationPlan,
  target: MigrationTarget,
  state: MigrationProgress,
  signal: AbortSignal,
  emit: () => void,
): Promise<Map<string, ImportedFile>> {
  const existing = await target.files(signal);
  const result = new Map<string, ImportedFile>();
  const seen = new Set<string>();
  for (const file of plan.files) {
    signal.throwIfAborted();
    if (seen.has(file.path)) {
      throw new Error("Duplicate import destination path.");
    }
    seen.add(file.path);
  }
  // Bound peak hashing/upload memory. Keep Readwise serial to honour its API budget.
  const concurrency = plan.service === "zotero" ? 3 : 1;
  const report = (): void => {
    state.phase = `Files: ${String(state.files)} of ${String(plan.files.length)}`;
    emit();
  };
  for (let offset = 0; offset < plan.files.length; offset += concurrency) {
    signal.throwIfAborted();
    report();
    const settled = await Promise.allSettled(
      plan.files.slice(offset, offset + concurrency).map(async (file) => {
        const descriptor = await commitFile(
          file,
          existing.get(file.path),
          target,
          signal,
          (bytes) => {
            state.transferredBytes = bytes;
            report();
          },
        );
        result.set(file.key, descriptor);
        state.files++;
        state.completed++;
        state.transferredBytes = 0;
        report();
      }),
    );
    // Do not return control while sibling uploads are still mutating the destination.
    const failed = settled.find((outcome) => outcome.status === "rejected");
    if (failed?.status === "rejected") {
      const reason: unknown = failed.reason;
      throw reason instanceof Error ? reason : new Error("File transfer failed.");
    }
  }
  return result;
}
async function commitFile(
  file: MigrationFile,
  existing: ImportedFile | undefined,
  target: MigrationTarget,
  signal: AbortSignal,
  progress: (bytes: number) => void,
): Promise<ImportedFile> {
  if (existing && file.digest === existing.contentDigest) {
    return existing;
  }
  const blob = await file.load(signal);
  signal.throwIfAborted();
  const digest = `sha256:${await hash(blob)}`;
  if (file.digest && file.digest !== digest) {
    throw new Error("File checksum changed since preview.");
  }
  if (existing) {
    if (existing.contentDigest !== digest) {
      throw new Error(
        "An import file path already contains different bytes. No replacement was attempted.",
      );
    }
    return existing;
  }
  const hex = (await identity(`${target.collectionId}:${file.path}`, digest, "transfer")).slice(9);
  const transferId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  const descriptor = await target.upload(
    file.path,
    blob,
    file.mediaType,
    transferId,
    signal,
    progress,
  );
  if (descriptor.contentDigest !== digest) {
    throw new Error("Uploaded checksum does not match the original file.");
  }
  return descriptor;
}
