import {
  createReaderApplication,
  type MdbaseApplicationEntry,
} from "@mdbase-reader/connect/native";

import bundledManifest from "./generated/mdbase-app.json";

let entry: MdbaseApplicationEntry | null = null;

/**
 * The one public SDK entry for this page, from the bundled canonical manifest. It
 * is created on first use (construction is IO-free) and never closed by the UI;
 * registration, Worker and storage start lazily on the first SDK action.
 */
export function readerSdk(): MdbaseApplicationEntry {
  entry ??= createReaderApplication({ environment: "lab", manifest: bundledManifest });
  return entry;
}
