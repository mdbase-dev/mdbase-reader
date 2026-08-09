import { cslProblemSummary, validateCslItem } from "../domain/citation.js";
import { DomainError } from "../domain/errors.js";

import type { SourceRepository } from "./ports.js";
import type { CslItem } from "../domain/citation.js";
import type { Source, SourceSummary } from "../domain/source.js";

export async function saveSourceCitation(
  sources: SourceRepository,
  source: Source,
  library: readonly SourceSummary[],
  value: unknown,
): Promise<Source> {
  const validation = validateCslItem(value);
  if (!validation.valid) {
    throw new DomainError("invalid-citation", cslProblemSummary(validation.problems));
  }
  assertUniqueCitekey(validation.item, source, library);
  return sources.updateCitation({
    collectionId: source.collectionId,
    sourceId: source.id,
    expectedRevision: source.recordRevision,
    citation: validation.item,
  });
}

function assertUniqueCitekey(
  citation: CslItem,
  source: Source,
  library: readonly SourceSummary[],
): void {
  const collision = library.find(
    (candidate) => candidate.id !== source.id && candidate.citation?.id === citation.id,
  );
  if (collision) {
    throw new DomainError(
      "duplicate-citekey",
      `The citekey @${citation.id} is already used by “${collision.title}”.`,
    );
  }
}
