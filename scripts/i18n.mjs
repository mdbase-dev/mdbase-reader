import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Invoke the kit's exported CLI function explicitly. Its initial bin entry guard
// compares a pnpm symlink with a resolved ESM filename and otherwise silently exits.
const require = createRequire(import.meta.url);
const config = pathToFileURL(require.resolve("@mdbase-dev/i18n/config"));
const { main } = await import(new URL("./cli.mjs", config).href);
await main(process.argv[2], process.argv.slice(3));
