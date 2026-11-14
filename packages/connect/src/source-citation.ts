import { isMdbaseError } from "@mdbase-dev/sdk";
import {
  CitationChangedElsewhereError,
  cslProblemSummary,
  cslProvenanceKey,
  cslValuesEqual,
  parseCslProvenance,
  preserveCslDismissals,
  recordRevision,
  validateCslItem,
  type CslProvenance,
  type Source,
  type SourceRepository,
} from "@mdbase-reader/core";

import { sourceFromDocument } from "./mapping.js";
import { frontmatterChanges, updateRecord, ConnectRepositoryError } from "./repository-client.js";

import type { MdbaseClient, RecordView } from "@mdbase-dev/sdk";

const maxCitationSaveAttempts = 3;

export async function writeSourceCitation(
  client: MdbaseClient,
  path: string,
  input: Parameters<SourceRepository["updateCitation"]>[0],
): Promise<Source> {
  const validation = validateCslItem(input.citation);
  if (!validation.valid) {
    throw new ConnectRepositoryError(
      "save citation metadata",
      cslProblemSummary(validation.problems),
    );
  }
  for (let attempt = 1; ; attempt += 1) {
    const guarded = "expectedCitation" in input;
    const current =
      guarded || input.provenance !== undefined
        ? await citationBeforeSave(client, path, input)
        : undefined;
    const revision = guarded && current ? recordRevision(current.revision) : undefined;
    // Re-read and merge on every retry: a provenance-only concurrent write may contain a
    // dismissal this caller's older preview does not know about. CSL remains the save guard.
    const provenance = citationProvenanceForSave(input.provenance, current);
    const patch = {
      csl: validation.item,
      ...(provenance !== undefined
        ? { [cslProvenanceKey]: Object.keys(provenance).length ? provenance : null }
        : {}),
    };
    try {
      const record = await updateRecord(client, current ?? { path }, {
        ...(revision === undefined ? {} : { ifRevision: revision }),
        ...frontmatterChanges(patch),
      });
      return sourceFromDocument(input.collectionId, record);
    } catch (error) {
      if (!isMdbaseError(error, "conflict") || revision === undefined) {
        throw error;
      }
      if (attempt < maxCitationSaveAttempts) {
        continue;
      }
      await citationBeforeSave(client, path, input);
      throw error;
    }
  }
}

function citationProvenanceForSave(
  provenance: CslProvenance | undefined,
  current: RecordView | undefined,
): CslProvenance | undefined {
  return provenance === undefined
    ? undefined
    : preserveCslDismissals(
        provenance,
        parseCslProvenance(
          current ? (current.effective ?? current.frontmatter)[cslProvenanceKey] : undefined,
        ),
      );
}

async function citationBeforeSave(
  client: MdbaseClient,
  path: string,
  input: Parameters<SourceRepository["updateCitation"]>[0],
): Promise<RecordView> {
  const current = await client.get(
    { path: path },
    { include: { effective: true, body: true, document: true } },
  );
  const citation = (current.effective ?? current.frontmatter)["csl"];
  // `null` is the baseline for a record that had no `csl` when it was loaded.
  if (
    "expectedCitation" in input &&
    !cslValuesEqual(citation ?? null, input.expectedCitation ?? null)
  ) {
    throw new CitationChangedElsewhereError(
      citation,
      parseCslProvenance((current.effective ?? current.frontmatter)[cslProvenanceKey]),
    );
  }
  return current;
}
