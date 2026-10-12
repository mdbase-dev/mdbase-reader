import { createReaderMdbase, type Mdbase } from "@mdbase-reader/connect/native";

import bundledManifest from "./generated/mdbase-app.json";

let entry: Mdbase | null = null;

/**
 * The one mdbase entry for this page, from the bundled canonical manifest. It is
 * created on first use (construction is IO-free) and never closed by the UI;
 * registration, Worker and storage start on `start()`.
 */
export function readerSdk(): Mdbase {
  entry ??= createReaderMdbase({ environment: "lab", manifest: bundledManifest });
  return entry;
}
