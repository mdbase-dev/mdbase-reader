import {
  array,
  object,
  type Fields,
  type MigrationPlan,
  type MigrationRecord,
  type MigrationSource,
} from "./model.js";
import { commitFiles } from "./run-files.js";
export interface ImportedFile {
  fileId: string;
  path: string;
  contentDigest: string;
}
export interface MigrationTarget {
  readonly collectionId: string;
  existing(signal: AbortSignal): Promise<Map<string, Fields>>;
  files(signal: AbortSignal): Promise<Map<string, ImportedFile>>;
  upload(
    path: string,
    blob: Blob,
    mediaType: string,
    transferId: string,
    signal: AbortSignal,
    progress: (bytes: number) => void,
  ): Promise<ImportedFile>;
  create(
    record: MigrationRecord,
    fields: Fields,
    type: "reader-source" | "reader-annotation",
    signal: AbortSignal,
  ): Promise<void>;
}
export interface MigrationResult {
  collectionId: string;
  files: number;
  created: number;
  skipped: number;
  verified: number;
}
export interface MigrationProgress extends MigrationResult {
  phase: string;
  completed: number;
  total: number;
  transferredBytes: number;
}
export async function previewMigration(
  plan: MigrationPlan,
  target: MigrationTarget,
  signal: AbortSignal,
): Promise<{ newRecords: number; existingRecords: number }> {
  const records = await target.existing(signal);
  let existingRecords = 0;
  for (const r of [...plan.sources, ...plan.annotations]) {
    const old = records.get(r.id);
    if (old) {
      checkIdentity(old, plan, r);
      existingRecords++;
    }
  }
  return {
    existingRecords,
    newRecords: plan.sources.length + plan.annotations.length - existingRecords,
  };
}
function checkIdentity(old: Fields, plan: MigrationPlan, record: MigrationRecord): void {
  const raw = object(old["import"], "existing import provenance");
  if (raw["namespace"] !== plan.namespace || raw["key"] !== record.key) {
    throw new Error("Import identity collision. Existing records will not be overwritten.");
  }
}
export async function runMigration(
  plan: MigrationPlan,
  target: MigrationTarget,
  signal: AbortSignal,
  onProgress: (progress: MigrationProgress) => void,
): Promise<MigrationResult> {
  const records = await target.existing(signal);
  const state: MigrationProgress = {
    collectionId: target.collectionId,
    files: 0,
    created: 0,
    skipped: 0,
    verified: 0,
    phase: "Preparing",
    completed: 0,
    total: plan.files.length + plan.sources.length + plan.annotations.length,
    transferredBytes: 0,
  };
  const emit = (): void => onProgress({ ...state });
  for (const r of [...plan.sources, ...plan.annotations]) {
    const old = records.get(r.id);
    if (old) {
      checkIdentity(old, plan, r);
    }
  }
  const descriptors = await commitFiles(plan, target, state, signal, emit);
  const sourceIds = new Map(plan.sources.map((s) => [s.key, s.id]));
  const commit = async (
    record: MigrationRecord,
    fields: Fields,
    type: "reader-source" | "reader-annotation",
  ): Promise<void> => {
    signal.throwIfAborted();
    if (records.has(record.id)) {
      state.skipped++;
    } else {
      await target.create(record, { ...fields, id: record.id }, type, signal);
      state.created++;
    }
    state.completed++;
    emit();
  };
  state.phase = "Creating sources";
  for (const source of plan.sources) {
    const documents = sourceDocuments(source, descriptors, plan);
    const existing = records.get(source.id);
    if (existing) {
      checkExistingDocuments(existing, documents);
    }
    await commit(source, { ...source.fields, documents }, "reader-source");
  }
  state.phase = "Creating annotations and notes";
  for (const annotation of plan.annotations) {
    const sourceId = sourceIds.get(annotation.sourceKey);
    if (!sourceId) {
      throw new Error("Annotation has no source.");
    }
    const document = annotation.fileKey ? descriptors.get(annotation.fileKey) : null;
    if (annotation.fileKey && !document) {
      throw new Error("Annotation file was not committed.");
    }
    await commit(
      annotation,
      {
        ...annotation.fields,
        source: `[[${sourceId}]]`,
        ...(document
          ? {
              document: {
                file_id: document.fileId,
                file: `[[${document.path}]]`,
                revision: document.contentDigest,
              },
            }
          : {}),
      },
      "reader-annotation",
    );
  }
  signal.throwIfAborted();
  state.phase = "Verifying imported records";
  emit();
  const confirmed = await target.existing(signal);
  for (const r of [...plan.sources, ...plan.annotations]) {
    const record = confirmed.get(r.id);
    if (!record) {
      throw new Error("Import verification failed: a record is missing.");
    }
    verifyImportedRecord(record, r, plan, descriptors);
    state.verified++;
  }
  state.phase = "Complete";
  emit();
  return {
    collectionId: target.collectionId,
    files: state.files,
    created: state.created,
    skipped: state.skipped,
    verified: state.verified,
  };
}
function sourceDocuments(
  source: MigrationSource,
  files: Map<string, ImportedFile>,
  plan: MigrationPlan,
): Fields[] {
  return source.documents.map((d) => {
    const file = files.get(d.fileKey);
    const specification = plan.files.find((f) => f.key === d.fileKey);
    if (!file || !specification) {
      throw new Error("Source file was not committed.");
    }
    return {
      file_id: file.fileId,
      file: `[[${file.path}]]`,
      revision: file.contentDigest,
      role: d.role,
      media_type: specification.mediaType,
      format: d.format,
      label: d.label,
    };
  });
}
function verifyImportedRecord(
  record: Fields,
  expected: MigrationRecord,
  plan: MigrationPlan,
  files: Map<string, ImportedFile>,
): void {
  checkIdentity(record, plan, expected);
  const source = plan.sources.find((s) => s.id === expected.id);
  if (source) {
    checkExistingDocuments(record, sourceDocuments(source, files, plan));
  }
  const annotation = plan.annotations.find((a) => a.id === expected.id);
  if (annotation?.fileKey) {
    const file = files.get(annotation.fileKey);
    const document = object(record["document"]);
    if (
      !file ||
      document["file_id"] !== file.fileId ||
      document["revision"] !== file.contentDigest
    ) {
      throw new Error("Annotation target verification failed.");
    }
  }
}
function checkExistingDocuments(existing: Fields, expected: Fields[]): void {
  const documents = array(existing["documents"] ?? []).map((d) => object(d));
  for (const file of expected) {
    if (
      !documents.some(
        (d) =>
          d["file_id"] === file["file_id"] &&
          d["revision"] === file["revision"] &&
          d["media_type"] === file["media_type"],
      )
    ) {
      throw new Error(
        "An existing source has different representations. Import into a new collection or review it explicitly; existing sources are never silently rewritten.",
      );
    }
  }
}
