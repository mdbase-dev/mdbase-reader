import { ConnectRepositoryError } from "./repository-client.js";
import { documentEntry } from "./source-files.js";

import type { CollectionFileDescriptor } from "@mdbase-dev/connect";
import type { PlannedSourceFileImport, PlannedSourceRepresentation } from "@mdbase-reader/core";

type Descriptors = ReadonlyMap<PlannedSourceRepresentation["role"], CollectionFileDescriptor>;

/** The frontmatter of a newly created source record. */
export function sourceFrontmatter(
  plan: PlannedSourceFileImport,
  descriptors: Descriptors,
): Readonly<Record<string, unknown>> {
  return {
    id: plan.sourceId,
    title: plan.title,
    kind: plan.kind,
    saved_at: plan.savedAt,
    ...(plan.tags ? { tags: plan.tags } : {}),
    ...metadataFields(plan.metadata),
    ...(plan.capture ? captureFields(plan.capture) : plan.url ? { url: plan.url } : {}),
    // A source created without a file has no `documents` until one is attached.
    ...(plan.representations.length ? { documents: documentEntries(plan, descriptors) } : {}),
    reading: { status: "inbox" },
  };
}

function metadataFields(
  metadata: PlannedSourceFileImport["metadata"],
): Readonly<Record<string, unknown>> {
  if (!metadata) {
    return {};
  }
  return {
    ...(metadata.authors?.length ? { authors: metadata.authors } : {}),
    ...(metadata.published ? { published: metadata.published } : {}),
    ...(metadata.description ? { description: metadata.description } : {}),
    ...(metadata.language ? { language: metadata.language } : {}),
    ...(metadata.site ? { site: metadata.site } : {}),
  };
}

function captureFields(
  capture: NonNullable<PlannedSourceFileImport["capture"]>,
): Readonly<Record<string, unknown>> {
  return {
    url: capture.canonicalUrl,
    ...(capture.submittedUrl !== capture.canonicalUrl
      ? { original_url: capture.submittedUrl }
      : {}),
    capture: {
      method: "url",
      application: "dev.mdbase.reader",
      captured_at: capture.retrievedAt,
      submitted_url: capture.submittedUrl,
      canonical_url: capture.canonicalUrl,
    },
  };
}

function documentEntries(
  plan: PlannedSourceFileImport,
  descriptors: Descriptors,
): readonly Readonly<Record<string, unknown>>[] {
  const { capture } = plan;
  return plan.representations.map((representation) => {
    const descriptor = descriptors.get(representation.role);
    if (!descriptor) {
      throw new ConnectRepositoryError(
        "create imported source",
        "missing_file_descriptor",
        `The ${representation.role} representation was not committed.`,
      );
    }
    const derivedFrom = representation.derivedFromRole
      ? descriptors.get(representation.derivedFromRole)
      : undefined;
    return documentEntry(representation, descriptor, {
      ...(derivedFrom ? { derived_from_file_id: derivedFrom.fileId } : {}),
      ...(capture && representation.role === "archive"
        ? { origin_url: capture.canonicalUrl, retrieved_at: capture.retrievedAt }
        : {}),
    });
  });
}
