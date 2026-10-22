import { createReaderMdbase, type Mdbase } from "@mdbase-reader/connect/native";

import { assertReaderManifestOrigin, readerBuildEnvironment } from "./build-environment.js";
import bundledManifest from "./generated/mdbase-app.json";

let entry: Mdbase | null = null;

/**
 * The one mdbase entry for this page, from the bundled canonical manifest. It is
 * created on first use (construction is IO-free) and never closed by the UI;
 * registration, Worker and storage start on `start()`. The SDK environment is
 * this build's exact environment, and a manifest bundled for another
 * environment's origin refuses instead of being retargeted.
 */
export function readerSdk(): Mdbase {
  if (!entry) {
    const environment = readerBuildEnvironment(import.meta.env.VITE_MDBASE_ENV);
    assertReaderManifestOrigin(environment, bundledManifest.homepage);
    entry = createReaderMdbase({ environment, manifest: bundledManifest });
  }
  return entry;
}
