// Unprivileged web-only build. Extension shipping remains on its independent store train.
import { execFileSync } from "node:child_process";
import { cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareInstalled } from "./originals.mjs";
import { publicationInventory, serializeInventory } from "./publisher.mjs";
const output = process.argv[2],
  plan = JSON.parse(await readFile(join(output, "plan.json"), "utf8"));
await compareInstalled(process.cwd(), plan.sdkTrust.archives);
const env = {
  ...process.env,
  MDBASE_ENV: plan.target,
  VITE_MDBASE_ENV: plan.target,
  MDBASE_READER_ORIGIN: plan.origin,
  MDBASE_READER_BUILD_ID: plan.sha.slice(0, 12),
  VITE_MDBASE_READER_BUILD_ID: plan.sha.slice(0, 12),
  VITE_MDBASE_CONNECT_URL: plan.sdkTrust.release.cpOrigin,
  VITE_MDBASE_CONNECT_LOOPBACK_URL: "",
  READER_PUBLICATION_PLAN: join(output, "plan.json"),
};
const run = (command, args, cwd = process.cwd()) =>
  execFileSync(command, args, { stdio: "inherit", env, cwd });
run("pnpm", ["rebuild", "--pending"]);
run("pnpm", ["--filter", "@mdbase-reader/app", "build"]);
const toolPath = join(process.env.RUNNER_TEMP, "reader-build-tool-path");
run(process.execPath, [fileURLToPath(new URL("./tool.mjs", import.meta.url)), toolPath]);
const cli = (await readFile(toolPath, "utf8")).trim();
run(process.execPath, [
  cli,
  "pages",
  "functions",
  "build",
  "apps/reader/functions",
  "--outdir",
  "apps/reader/dist/_worker.js",
]);
await cp("apps/reader/dist", join(output, "publish"), {
  recursive: true,
  errorOnExist: true,
  force: false,
});
await writeFile(
  join(output, "inventory.json"),
  serializeInventory(await publicationInventory(join(output, "publish"), plan)),
);
