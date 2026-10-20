import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { format, resolveConfig } from "prettier";

import { extensionEnvironment, extensionMdbaseManifest } from "./extension-manifest.mjs";
import { buildReaderManifest } from "../../reader/scripts/reader-manifest.mjs";

const root = resolve(import.meta.dirname, "..");
const reader = await buildReaderManifest();
const manifest = extensionMdbaseManifest(reader, extensionEnvironment());
const target = resolve(root, "src/generated/mdbase-app.json");
await mkdir(resolve(target, ".."), { recursive: true });
await writeFile(
  target,
  await format(JSON.stringify(manifest), { ...(await resolveConfig(target)), parser: "json" }),
);
