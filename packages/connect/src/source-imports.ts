import { sourceContract } from "./contracts.js";
import { sourceFromDocument } from "./mapping.js";
import { ConnectRepositoryError, outcomeValue } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type {
  CollectionFileDescriptor,
  ConnectOutcome,
  MdbaseConnection,
  MdbaseFileUploadOptions,
  RecordDocument,
} from "@mdbase-dev/connect";
import type { PlannedSourceFileImport, Source, SourceImportRepository } from "@mdbase-reader/core";

export interface ReaderSourceFileClient {
  upload(
    path: string,
    source: Blob,
    options?: MdbaseFileUploadOptions,
  ): Promise<CollectionFileDescriptor>;
}

export class ConnectSourceImportRepository implements SourceImportRepository {
  public constructor(
    private readonly records: ReaderConnectClient,
    private readonly files: ReaderSourceFileClient,
  ) {}

  public async commitFile(plan: PlannedSourceFileImport): Promise<Source> {
    const descriptor = await this.files.upload(
      plan.filePath,
      new Blob([plan.bytes.slice().buffer], { type: plan.mediaType }),
      {
        mediaType: plan.mediaType,
        transferId: plan.mutationId,
      },
    );
    if (descriptor.contentDigest !== plan.contentDigest) {
      throw new ConnectRepositoryError(
        "verify imported file",
        "content_digest_mismatch",
        "The stored file did not match the selected bytes.",
      );
    }

    const created = await this.records.create({
      path: plan.recordPath,
      type: "reader-source",
      frontmatter: sourceFrontmatter(plan, descriptor),
      body: `# ${plan.title}\n`,
      includeDocument: true,
    });
    const document = created.ok ? created.value : await this.recoverCreatedSource(plan, created);
    return sourceFromDocument(plan.collectionId, document);
  }

  private async recoverCreatedSource(
    plan: PlannedSourceFileImport,
    failure: Exclude<ConnectOutcome<RecordDocument>, { readonly ok: true }>,
  ): Promise<RecordDocument> {
    const recovered = await this.records.read({
      path: plan.recordPath,
      contract: sourceContract,
      includeDocument: true,
    });
    if (recovered.ok && recovered.value.effectiveFrontmatter["id"] === plan.sourceId) {
      return recovered.value;
    }
    return outcomeValue(failure, "create imported source");
  }
}

function sourceFrontmatter(
  plan: PlannedSourceFileImport,
  descriptor: CollectionFileDescriptor,
): Readonly<Record<string, unknown>> {
  return {
    id: plan.sourceId,
    title: plan.title,
    kind: plan.kind,
    saved_at: plan.savedAt,
    documents: [
      {
        file_id: descriptor.fileId,
        file: `[[${descriptor.path}]]`,
        role: "primary",
        format: plan.format,
        media_type: plan.mediaType,
        revision: descriptor.contentDigest,
        label: plan.originalName,
      },
    ],
    reading: { status: "inbox" },
  };
}

export function connectSourceImportRepository(
  connection: MdbaseConnection,
  records: ReaderConnectClient,
): ConnectSourceImportRepository {
  return new ConnectSourceImportRepository(records, connection.files);
}
