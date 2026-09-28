import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { format, resolveConfig } from "prettier";

import { extensionEnvironment } from "./extension-manifest.mjs";
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
  project_url: `${extensionEnvironment().readerOrigin}/`,
};
const target = resolve(root, "src/generated/mdbase-app.json");
await mkdir(resolve(target, ".."), { recursive: true });
await writeFile(
  target,
  await format(JSON.stringify(manifest), { ...(await resolveConfig(target)), parser: "json" }),
);
