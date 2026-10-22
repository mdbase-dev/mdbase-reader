import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  sourceHostingPolicy,
  uploadConfiguration,
  readHostingMetadata,
} from "./lib/reader-hosting-policy.mjs";
const [command, path, planPath, deploymentPath, preflightPath] = process.argv.slice(2);
const policy = await sourceHostingPolicy(resolve("."));
const json = async (p) => JSON.parse(await readFile(p, "utf8"));
if (command === "upload-config") {
  await mkdir(path, { recursive: true });
  await writeFile(
    join(path, "wrangler.json"),
    JSON.stringify(uploadConfiguration(policy), null, 2),
  );
} else if (command === "metadata") {
  try {
    const result = await readHostingMetadata({
      policy,
      plan: await json(planPath),
      deployment: deploymentPath ? await json(deploymentPath) : null,
      preflight: preflightPath ? await json(preflightPath) : null,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
    });
    await writeFile(path, JSON.stringify(result, null, 2));
  } catch (error) {
    await writeFile(
      path,
      JSON.stringify({ failed: true, evidence: error.safeEvidence ?? null }, null, 2),
    );
    throw Error("Reader hosting metadata refused; safe failure evidence preserved");
  }
} else throw Error("Unknown hosting command");
