import { citationFields } from "./source-addition-flow.js";

import type { CitationCandidate, SourceImportMetadata } from "@mdbase-reader/core";

/** What Reader proposes for a chosen file before it is imported. */
export interface FileImportSuggestion {
  readonly title?: string;
  readonly kind?: string;
  readonly metadata: SourceImportMetadata;
  readonly citation?: CitationCandidate;
}

/**
 * Reads the file's own metadata, then looks up its DOI, arXiv ID or ISBN. The looked-up record
 * wins over the file's metadata, which is often incomplete. Lookup failures leave the file's
 * own details, so import never waits on a network problem.
 */
export async function suggestForFile(
  file: { readonly name: string; readonly bytes: Uint8Array; readonly mediaType?: string },
  signal?: AbortSignal,
): Promise<FileImportSuggestion> {
  const [{ readDocumentFileDetails }, { lookUpCitation }] = await Promise.all([
    import("./document-details.js"),
    import("@mdbase-reader/web-capture/citation-lookup"),
  ]);
  const details = await readDocumentFileDetails(file, signal);
  const { doi, arxiv, isbn } = details.identifiers;
  const query = doi ?? (arxiv ? `arxiv:${arxiv}` : isbn ? `isbn:${isbn}` : undefined);
  const citation = query
    ? await lookUpCitation(
        { kind: "identifier", value: query },
        {
          clientName: `mdbase-reader (${globalThis.location.origin})`,
          ...(signal ? { signal } : {}),
        },
      ).catch(() => undefined)
    : undefined;
  signal?.throwIfAborted();
  const fields = citation ? citationFields(citation.citation) : undefined;
  const title = fields?.title ?? details.title;
  return {
    ...(title ? { title } : {}),
    ...(fields?.kind ? { kind: fields.kind } : {}),
    metadata: { ...details.metadata, ...fields?.metadata },
    ...(citation ? { citation } : {}),
  };
}
