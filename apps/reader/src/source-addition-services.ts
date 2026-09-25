import { lookUpCitation } from "@mdbase-reader/web-capture/citation-lookup";

import { readDocumentFileDetails } from "./document-details.js";
import { fetchCapture } from "./web-capture-client.js";

import type { SourceAdditionServices } from "./source-addition-flow.js";

/** The live services behind adding a source: Reader's capture service, doi.org and Citoid. */
export function readerSourceAdditionServices(
  input: Pick<SourceAdditionServices, "workspace" | "onStatus" | "signal" | "importOptions">,
): SourceAdditionServices {
  const signal = input.signal ? { signal: input.signal } : {};
  return {
    ...input,
    capture: (url, options) => fetchCapture(url, options),
    lookUp: (request) =>
      lookUpCitation(request, {
        clientName: `mdbase-reader (${globalThis.location.origin})`,
        ...signal,
      }),
    pdfIdentifiers: async (file) =>
      (await readDocumentFileDetails({ name: "download.pdf", bytes: file.bytes }, input.signal))
        .identifiers,
  };
}
