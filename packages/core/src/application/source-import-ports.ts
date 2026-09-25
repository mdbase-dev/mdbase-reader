import type { ReaderRequestOptions } from "./ports.js";
import type { CollectionId, MutationId, SourceId } from "../domain/identity.js";
import type { Source, SourceSummary } from "../domain/source.js";
import type { DateTime } from "../domain/time.js";

export interface SourceImportRepository {
  findExactDuplicate(
    collectionId: CollectionId,
    contentDigests: readonly `sha256:${string}`[],
    options?: ReaderRequestOptions,
  ): Promise<SourceSummary | null>;
  /** Uploads the planned files (possibly none) and creates the source record. */
  commitFile(plan: PlannedSourceFileImport, options?: SourceImportOptions): Promise<Source>;
  /** Uploads one file and appends it to an existing source's `documents`. */
  attachFile?(plan: PlannedSourceAttachment, options?: SourceImportOptions): Promise<Source>;
}

export type SourceDocumentFormat = "pdf" | "epub" | "html";

export interface SourceFileImportRequest {
  readonly collectionId: CollectionId;
  readonly name: string;
  readonly declaredMediaType?: string;
  readonly bytes: Uint8Array;
  readonly title?: string;
  readonly capture?: SourceCaptureProvenance;
  readonly archive?: SourceCaptureArchive;
  readonly metadata?: SourceImportMetadata;
  /** Authored note and tags for a newly created source; never applied to duplicates. */
  readonly body?: string;
  readonly tags?: readonly string[];
  /** Broad classification, such as `paper` or `book`; defaults from the capture. */
  readonly kind?: string;
  /** Where the source lives on the web when it is not a web capture, such as a DOI link. */
  readonly url?: string;
}

/** A source with no document yet: a citation or reading-list entry to attach files to later. */
export type SourceRecordCreationRequest = Omit<
  SourceFileImportRequest,
  "name" | "declaredMediaType" | "bytes" | "capture" | "archive"
> & { readonly title: string };

export interface SourceFileAttachmentRequest {
  /** A library summary is enough: only identity, location and current documents are used. */
  readonly source: Pick<SourceSummary, "collectionId" | "id" | "path" | "documents">;
  readonly name: string;
  readonly declaredMediaType?: string;
  readonly bytes: Uint8Array;
  /** Where the file was downloaded from, when it was fetched rather than chosen. */
  readonly originUrl?: string;
}

export interface SourceCaptureProvenance {
  readonly submittedUrl: string;
  readonly canonicalUrl: string;
  readonly retrievedAt: DateTime;
}

export interface SourceCaptureArchive {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface SourceImportMetadata {
  readonly authors?: readonly string[];
  readonly published?: string;
  readonly description?: string;
  readonly language?: string;
  readonly site?: string;
}

export interface SourceImportProgress {
  readonly phase: "checking" | "recovering" | "uploading" | "creating";
  readonly completedBytes: number;
  readonly totalBytes: number;
  readonly fileIndex: number;
  readonly fileCount: number;
}

export interface SourceImportOptions extends ReaderRequestOptions {
  readonly onProgress?: (progress: SourceImportProgress) => void;
  /**
   * Search for exact uploaded bytes left by an earlier failed attempt before
   * starting a new transfer. Ordinary first attempts keep this disabled so a
   * large collection does not pay an orphan-recovery scan on every import.
   */
  readonly recoverExistingFiles?: boolean;
}

export interface PlannedSourceRepresentation {
  readonly transferId: MutationId;
  readonly role: "primary" | "archive" | "alternative";
  readonly format: SourceDocumentFormat;
  readonly mediaType: string;
  readonly contentDigest: `sha256:${string}`;
  readonly originalName: string;
  readonly filePath: string;
  readonly bytes: Uint8Array;
  readonly derivedFromRole?: "archive";
}

export interface PlannedSourceFileImport {
  readonly collectionId: CollectionId;
  readonly sourceId: SourceId;
  readonly title: string;
  readonly kind: string;
  readonly savedAt: DateTime;
  readonly recordPath: string;
  /** Used instead of `recordPath` when another record already has that path. */
  readonly fallbackRecordPath?: string;
  /** Empty for a source created without a document. */
  readonly representations: readonly PlannedSourceRepresentation[];
  readonly body?: string;
  readonly tags?: readonly string[];
  readonly capture?: SourceCaptureProvenance;
  readonly metadata?: SourceImportMetadata;
  readonly url?: string;
}

export interface PlannedSourceAttachment {
  readonly collectionId: CollectionId;
  readonly sourceId: SourceId;
  readonly recordPath: string;
  readonly representation: PlannedSourceRepresentation;
  readonly originUrl?: string;
  readonly retrievedAt: DateTime;
}
