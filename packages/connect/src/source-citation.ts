import {
  CitationChangedElsewhereError,
  cslProblemSummary,
  cslProvenanceKey,
  cslValuesEqual,
  parseCslProvenance,
  recordRevision,
  validateCslItem,
  type Source,
  type SourceRepository,
} from "@mdbase-reader/core";

import { sourceFromDocument } from "./mapping.js";
import { ConnectRepositoryError, outcomeValue } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";

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
  const patch = {
    csl: validation.item,
    ...(input.provenance !== undefined
      ? {
          [cslProvenanceKey]: Object.keys(input.provenance).length > 0 ? input.provenance : null,
        }
      : {}),
  };
  for (let attempt = 1; ; attempt += 1) {
    const revision = !("expectedCitation" in input)
      ? undefined
      : await unchangedCitationRevision(client, path, input.expectedCitation);
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
      await unchangedCitationRevision(client, path, input.expectedCitation);
    }
    return sourceFromDocument(input.collectionId, outcomeValue(outcome, "save citation metadata"));
  }
}

async function unchangedCitationRevision(
  client: ReaderConnectClient,
  path: string,
  expectedCitation: unknown,
): Promise<ReturnType<typeof recordRevision>> {
  const current = outcomeValue(
    await client.read({ path, includeDocument: true }),
    "read source before saving citation metadata",
  );
  const citation = current.effectiveFrontmatter["csl"];
  // `null` is the baseline for a record that had no `csl` when it was loaded.
  if (!cslValuesEqual(citation ?? null, expectedCitation ?? null)) {
    throw new CitationChangedElsewhereError(
      citation,
      parseCslProvenance(current.effectiveFrontmatter[cslProvenanceKey]),
    );
  }
  return recordRevision(current.revision);
}
