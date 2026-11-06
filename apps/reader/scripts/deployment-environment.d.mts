import type { ReaderSdkTarget } from "./reader-sdk.mjs";

export function readerAppUrls(target: ReaderSdkTarget): {
  reader: string;
  editor: string;
  writer: string;
};
