import type { FileView, UploadOptions, MdbaseClient } from "@mdbase-dev/sdk";
import type { PlannedSourceRepresentation } from "@mdbase-reader/core";

export type ReaderSourceFileListOptions = NonNullable<
  Parameters<MdbaseClient["files"]["list"]>[0]
> & { readonly contentDigests?: readonly string[] };
export interface ReaderSourceFileClient {
  list?(options?: ReaderSourceFileListOptions): AsyncIterable<FileView>;
  upload(path: string, source: Blob, options?: UploadOptions): Promise<FileView>;
}

export function documentEntry(
  representation: PlannedSourceRepresentation,
  file: FileView,
  extra: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    file_id: file.id,
    file: `[[${file.path}]]`,
    role: representation.role,
    format: representation.format,
    media_type: representation.mediaType,
    revision: file.digest,
    label: representation.originalName,
    ...extra,
  };
}
