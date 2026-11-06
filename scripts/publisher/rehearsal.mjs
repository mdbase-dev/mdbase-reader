// Credential-free rehearsal in a disposable tree, not a dispatch/admission receipt.
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadOriginals } from "./originals.mjs";
import { prepareInstall } from "./install-inputs.mjs";
import { deploymentFor } from "./refs.mjs";
const target = process.argv[2];
if (!["staging", "production"].includes(target)) throw Error("Explicit rehearsal target required");
if (process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_ACCOUNT_ID)
  throw Error("No deployment credentials permitted");
const base = await mkdtemp(join(tmpdir(), "reader-rehearsal-")),
  root = join(base, "candidate"),
  output = join(base, "artifact"),
  tools = join(base, "tools");
const policy = JSON.parse(await readFile("config/sdk-publication.json", "utf8")).sdkPublication;
const sdkTrust = await loadOriginals({
  target,
  repoRoot: process.cwd(),
  hashes: { READER_TRUST_ASSET_SHA256: policy.environments[target].sha256 },
});
const destination = deploymentFor(target),
  plan = {
    qualificationOnly: true,
    sha: "0".repeat(40),
    tree: "0".repeat(40),
    target,
    origin: destination.origin,
    pagesBranch: destination.branch,
    sdkTrust,
  };
try {
  await mkdir(root);
  await mkdir(output);
  await mkdir(tools);
  for (const path of [
    "apps",
    "packages",
    "scripts",
    "tools",
    "config",
    "vendor",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "i18n-policy.json",
    "lingui.config.mjs",
    "tsconfig.base.json",
    "tsconfig.json",
    "eslint.config.js",
  ])
    await cp(path, join(root, path), {
      recursive: true,
      filter: (path) => !path.split("/").some((p) => ["node_modules", "dist", ".git"].includes(p)),
    });
  await writeFile(join(output, "plan.json"), JSON.stringify(plan, null, 2) + "\n");
  await prepareInstall(plan, root);
  const run = (cmd, args, env = process.env) =>
    execFileSync(cmd, args, { cwd: root, stdio: "inherit", env });
  run("pnpm", ["install", "--frozen-lockfile", "--ignore-scripts", "--ignore-pnpmfile"]);
  run(process.execPath, [fileURLToPath(new URL("./build.mjs", import.meta.url)), output], {
    ...process.env,
    RUNNER_TEMP: tools,
    READER_SOURCE_ROOT: root,
  });
  console.log(
    "Authenticated " + target + " build and complete inventory rehearsal passed; no deployment",
  );
} finally {
  await rm(base, { recursive: true, force: true });
}
