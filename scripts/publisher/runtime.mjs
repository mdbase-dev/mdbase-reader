// Candidate hosting policy is data only; no candidate scripts are executed.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sourceHostingPolicy, uploadConfiguration } from "../lib/reader-hosting-policy.mjs";
const [command, root] = process.argv.slice(2);
if (command !== "upload-config") throw Error("Unknown hosting command");
const policy = await sourceHostingPolicy(process.env.READER_SOURCE_ROOT ?? process.cwd());
await mkdir(root, { recursive: true });
await writeFile(join(root, "wrangler.json"), JSON.stringify(uploadConfiguration(policy), null, 2), {
  flag: "wx",
});
