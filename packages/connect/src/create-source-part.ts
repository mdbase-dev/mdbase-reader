import {
  cslValuesEqual,
  parseDocumentRange,
  sourceFieldsFromCitation,
  validateCslItem,
  sourceLink,
  type PlannedSourcePart,
  type ReaderRequestOptions,
  type Source,
} from "@mdbase-reader/core";

import { sourceContract } from "./contracts.js";
import { CreateFollowThrough } from "./create-follow-through.js";
import { sourceFromDocument } from "./mapping.js";
import { outcomeValue, type ReaderConnectClient } from "./repository-client.js";
import { checkSourcePartChain } from "./source-parts.js";
import { ConnectSourceRepository } from "./source-repository.js";

/** Single record create: relation, citation and shared-file range succeed or fail together. */
// Validate every boundary before the single create; no partial relation/document writes.
// eslint-disable-next-line complexity
export async function createSourcePart(
  records: ReaderConnectClient,
  plan: PlannedSourcePart,
  options: ReaderRequestOptions = {},
  creates: CreateFollowThrough = new CreateFollowThrough(records),
): Promise<Source> {
  options.signal?.throwIfAborted();
  const repository = new ConnectSourceRepository(records);
  const parent = await repository.get(plan.collectionId, plan.parent.id, options);
  if (!parent?.recordRevision || parent.recordRevision !== plan.parent.recordRevision) {
    throw new Error("The book changed. Review the chapter preview again.");
  }
  const chain = await checkSourcePartChain(repository, plan.collectionId, plan.sourceId, parent.id);
  if (chain.problem || chain.missing) {
    throw new Error("The parent chain is incomplete or cyclic. Repair it before creating parts.");
  }
  if (!plan.title.trim() || plan.citation["type"] !== "chapter") {
    throw new Error("A chapter title and CSL type chapter are required.");
  }
  const citation = validateCslItem(plan.citation);
  if (!citation.valid) {
    throw new Error("Invalid chapter citation.");
  }
  const document = plan.document;
  if (
    document &&
    (!document.fileId ||
      !document.file ||
      !/^sha256:[a-f0-9]{64}$/u.test(document.revision) ||
      !parseDocumentRange(document.range) ||
      !(
        (document.mediaType === "application/pdf" && document.range?.kind === "pages") ||
        (document.mediaType === "application/epub+zip" && document.range?.kind === "epub-spine")
      ))
  ) {
    throw new Error("The chapter needs a verified file identity, revision and range.");
  }
  if (
    document &&
    !parent.documents.some(
      (entry) =>
        entry.fileId === document.fileId &&
        entry.file === document.file &&
        entry.revision === document.revision,
    )
  ) {
    throw new Error("The shared document is no longer attached to the book.");
  }
  const frontmatter = {
    ...sourceFieldsFromCitation(citation.item),
    id: plan.sourceId,
    title: plan.title,
    kind: "document",
    saved_at: new Date().toISOString(),
    reading: { status: "inbox" },
    relations: [{ relation: "part-of", target: sourceLink(parent) }],
    csl: plan.citation,
    "csl-provenance": plan.provenance,
    ...(document
      ? {
          documents: [
            {
              file_id: document.fileId,
              file: document.file,
              revision: document.revision,
              media_type: document.mediaType,
              role: "primary",
              range: document.range,
              format: document.mediaType === "application/pdf" ? "pdf" : "epub",
            },
          ],
        }
      : {}),
  };
  // Unknown outcomes and explicit retries reconcile the exact reviewed identity, never a title.
  // Each attempt stamps its own save time, so an earlier attempt's write differs only there.
  const created = await creates.create(
    {
      key: plan.sourceId,
      collectionId: plan.collectionId,
      kind: "source-part",
      recordId: plan.sourceId,
      label: plan.title,
      candidates: plan.recordPathCandidates,
      input: { type: "reader-source", frontmatter, body: `# ${plan.title}\n` },
      readBack: { contract: sourceContract, includeDocument: true },
      isOurs: (existing) =>
        Object.entries(frontmatter).every(
          ([key, value]) =>
            key === "saved_at" || cslValuesEqual(existing.effectiveFrontmatter[key], value),
        ),
    },
    options,
  );
  return sourceFromDocument(
    plan.collectionId,
    outcomeValue(created, "create chapter source"),
    parent.id,
  );
}
