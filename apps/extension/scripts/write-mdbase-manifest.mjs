import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { format, resolveConfig } from "prettier";

import { extensionEnvironment } from "./extension-manifest.mjs";
import { buildReaderManifest } from "../../reader/scripts/reader-manifest.mjs";

const root = resolve(import.meta.dirname, "..");
const reader = await buildReaderManifest();
const environment = extensionEnvironment();
const sdkEnvironment = environment.target === "lab" ? "lab" : "production";
// A web app manifest whose pages are the extension's: Connect registers the extension's
// exact chrome-extension origins under installation_origins for this environment.
const manifest = {
  ...reader,
  id: "dev.mdbase.reader.extension",
  name: "mdbase Reader browser extension",
  homepage: `${environment.readerOrigin}/`,
  icon: `${environment.readerOrigin}/favicon.svg`,
  redirect_uris: [`${environment.readerOrigin}/`],
  installation_origins: { [sdkEnvironment]: { "app-runtime": environment.extensionOrigins } },
};
const target = resolve(root, "src/generated/mdbase-app.json");
await mkdir(resolve(target, ".."), { recursive: true });
await writeFile(
  target,
  await format(JSON.stringify(manifest), { ...(await resolveConfig(target)), parser: "json" }),
);
