import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildReaderManifest } from "./reader-manifest.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const manifest = await buildReaderManifest({
  origin: process.env.MDBASE_READER_ORIGIN ?? "https://reader.mdbase.dev",
  basePath: process.env.MDBASE_READER_BASE_PATH ?? "/",
});
const document = `${JSON.stringify(manifest, null, 2)}\n`;
const targets = [
  resolve(projectRoot, "public", ".well-known", "mdbase-app.json"),
  resolve(projectRoot, "src", "generated", "mdbase-app.json"),
];

for (const target of targets) {
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, document);
}
