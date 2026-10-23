import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const destination = resolve(process.argv[2] ?? "dist", "locales");
await mkdir(destination, { recursive: true });
await cp(new URL("../packages/i18n/locales", import.meta.url), destination, {
  recursive: true,
  filter: (source) => !source.endsWith(".po"),
});
