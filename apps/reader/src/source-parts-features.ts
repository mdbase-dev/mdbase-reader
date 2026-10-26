import type { SourceSummary } from "@mdbase-reader/core";

export function supportsChapterCreation(source: SourceSummary): boolean {
  return source.documents.some(({ mediaType }) =>
    ["application/pdf", "application/epub+zip"].includes(mediaType),
  );
}

/** Write UI stays opt-in until isolated Connect LAB acceptance is completed. */
export const sourcePartCreationEnabled =
  import.meta.env["VITE_READER_SOURCE_PARTS_CREATION"] === "1";
