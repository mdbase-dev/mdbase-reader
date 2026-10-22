import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const root = process.argv[2];
const hash = async (path) =>
  createHash("sha256")
    .update(await readFile(join(root, path)))
    .digest("hex");
const plan = JSON.parse(await readFile(join(root, "plan.json"), "utf8"));
await writeFile(
  join(root, "envelope.json"),
  JSON.stringify(
    {
      repository: process.env.GITHUB_REPOSITORY,
      run: process.env.GITHUB_RUN_ID,
      attempt: process.env.GITHUB_RUN_ATTEMPT,
      event: process.env.GITHUB_EVENT_NAME,
      source: process.env.SOURCE_SHA,
      tree: plan.tree,
      target: process.env.TARGET,
      inventorySha256: await hash("inventory.json"),
      planSha256: await hash("plan.json"),
      extensionInventorySha256: await hash("extension-inventory.json"),
      extensionZipSha256: await hash("extension.zip"),
      installerEvidenceSha256: await hash("installer-evidence.json"),
    },
    null,
    2,
  ),
);
