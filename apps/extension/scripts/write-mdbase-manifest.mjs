import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { format } from "prettier";

import { buildReaderManifest } from "../../reader/scripts/reader-manifest.mjs";

const root = resolve(import.meta.dirname, "..");
const reader = await buildReaderManifest();
const shared = { ...reader };
delete shared.homepage;
delete shared.icon;
delete shared.redirect_uris;
const manifest = {
  ...shared,
  distribution: "portable",
  id: "dev.mdbase.reader.extension",
  name: "mdbase Reader browser extension",
  project_url: "https://mdbase-reader.pages.dev/",
};
const target = resolve(root, "src/generated/mdbase-app.json");
await mkdir(resolve(target, ".."), { recursive: true });
await writeFile(target, await format(JSON.stringify(manifest), { parser: "json" }));
