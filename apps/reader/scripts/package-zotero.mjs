import { build } from "../../zotero-exporter/scripts/build.mjs";
import { resolve } from "node:path";
await build(resolve(import.meta.dirname, "../public/downloads"));
