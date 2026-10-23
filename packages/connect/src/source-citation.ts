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
import { ConnectRepositoryError, outcomeValue } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { RecordDocument } from "@mdbase-dev/connect";

const maxCitationSaveAttempts = 3;

export async function writeSourceCitation(
  client: ReaderConnectClient,
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
    const outcome = await client.update({
      path,
      ...(revision === undefined ? {} : { ifRevision: revision }),
      patch,
      includeDocument: true,
    });
    if (
      !outcome.ok &&
      revision !== undefined &&
      outcome.problem.code === "concurrent_modification"
    ) {
      // Recompare only CSL after a raced write; unrelated frontmatter changes are safe to rebase.
      if (attempt < maxCitationSaveAttempts) {
        continue;
      }
      await citationBeforeSave(client, path, input);
    }
    return sourceFromDocument(input.collectionId, outcomeValue(outcome, "save citation metadata"));
  }
}

function citationProvenanceForSave(
  provenance: CslProvenance | undefined,
  current: RecordDocument | undefined,
): CslProvenance | undefined {
  return provenance === undefined
    ? undefined
    : preserveCslDismissals(
        provenance,
        parseCslProvenance(current?.effectiveFrontmatter[cslProvenanceKey]),
      );
}

async function citationBeforeSave(
  client: ReaderConnectClient,
  path: string,
  input: Parameters<SourceRepository["updateCitation"]>[0],
): Promise<RecordDocument> {
  const current = outcomeValue(
    await client.read({ path, includeDocument: true }),
    "read source before saving citation metadata",
  );
  const citation = current.effectiveFrontmatter["csl"];
  // `null` is the baseline for a record that had no `csl` when it was loaded.
  if (
    "expectedCitation" in input &&
    !cslValuesEqual(citation ?? null, input.expectedCitation ?? null)
  ) {
    throw new CitationChangedElsewhereError(
      citation,
      parseCslProvenance(current.effectiveFrontmatter[cslProvenanceKey]),
    );
  }
  return current;
}
