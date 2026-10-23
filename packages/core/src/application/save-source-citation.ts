import { cslProblemSummary, validateCslItem } from "../domain/citation.js";
import { DomainError } from "../domain/errors.js";

import type { SourceRepository } from "./ports.js";
import type { CslItem } from "../domain/citation.js";
import type { CslProvenance } from "../domain/csl-provenance.js";
import type { Source, SourceSummary } from "../domain/source.js";

export interface SaveSourceCitationOptions {
  readonly provenance?: CslProvenance;
}

export async function saveSourceCitation(
  sources: SourceRepository,
  source: Source,
  library: readonly SourceSummary[],
  value: unknown,
  options: SaveSourceCitationOptions = {},
): Promise<Source> {
  const validation = validateCslItem(value);
  if (!validation.valid) {
    throw new DomainError("invalid-citation", cslProblemSummary(validation.problems));
  }
  assertUniqueCitekey(validation.item, source, library);
  return sources.updateCitation({
    collectionId: source.collectionId,
    sourceId: source.id,
    citation: validation.item,
    ...(options.provenance !== undefined ? { provenance: options.provenance } : {}),
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
