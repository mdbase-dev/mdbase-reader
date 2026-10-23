import { postAddress, postFromUrl, socialPostImport } from "@mdbase-reader/web-capture";
import { lookUpCitation } from "@mdbase-reader/web-capture/citation-lookup";

import { readDocumentFileDetails } from "./document-details.js";
import { fetchCapture } from "./web-capture-client.js";

import type { SourceAdditionServices } from "./source-addition-flow.js";

/** The live services behind adding a source: Reader's capture service, doi.org and Citoid. */
export function readerSourceAdditionServices(
  input: Pick<
    SourceAdditionServices,
    "workspace" | "onStatus" | "signal" | "importOptions" | "chapterGateway"
  >,
): SourceAdditionServices {
  const signal = input.signal ? { signal: input.signal } : {};
  return {
    ...input,
    capture: async (url, options) => {
      const activeSignal = options.signal ?? input.signal;
      const fetchOptions = activeSignal ? { signal: activeSignal } : {};
      const address = postAddress(url);
      if (address) {
        const document = new DOMParser().parseFromString("", "text/html");
        const post = await postFromUrl(url, document, fetchOptions).catch((reason: unknown) => {
          activeSignal?.throwIfAborted();
          if (address.platform !== "mastodon") {
            throw reason;
          }
          // A /@user/ID path alone is not proof of Mastodon. The HTML capture checks markers.
          return null;
        });
        if (post) {
          return {
            kind: "html",
            page: await socialPostImport(
              post,
              { retrievedAt: new Date().toISOString() },
              fetchOptions,
            ),
          };
        }
      }
      return fetchCapture(url, options);
    },
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
