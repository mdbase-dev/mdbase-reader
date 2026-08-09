import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const projectName = "mdbase-reader";
const deploymentOrigin = `https://${projectName}.pages.dev`;
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const manifestTargets = [
  resolve(projectRoot, "public", ".well-known", "mdbase-app.json"),
  resolve(projectRoot, "src", "generated", "mdbase-app.json"),
];
const originalManifests = await Promise.all(manifestTargets.map((target) => readFile(target)));

try {
  await run(pnpm, ["build"], {
    ...process.env,
    MDBASE_READER_ORIGIN: deploymentOrigin,
    VITE_MDBASE_CONNECT_URL: "https://connect.mdbase.dev",
  });
  await verifyDeploymentManifest();
} finally {
  await Promise.all(
    manifestTargets.map((target, index) => writeFile(target, originalManifests[index])),
  );
}

await run(pnpm, [
  "dlx",
  "wrangler@4.120.0",
  "pages",
  "deploy",
  "dist",
  "--project-name",
  projectName,
  "--branch",
  "main",
  "--commit-dirty=true",
]);

async function verifyDeploymentManifest() {
  const path = resolve(projectRoot, "dist", ".well-known", "mdbase-app.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  const homepage = `${deploymentOrigin}/`;
  if (
    manifest.homepage !== homepage ||
    manifest.icon !== `${homepage}favicon.svg` ||
    manifest.redirect_uris?.length !== 1 ||
    manifest.redirect_uris[0] !== homepage
  ) {
    throw new Error(`Reader deployment manifest does not declare ${deploymentOrigin}.`);
  }
}

async function run(command, arguments_, environment = process.env) {
  const child = spawn(command, arguments_, {
    cwd: projectRoot,
    env: environment,
    stdio: "inherit",
  });
  const code = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", resolveExit);
  });
  if (code !== 0) {
    throw new Error(`${command} ${arguments_.join(" ")} exited with status ${String(code)}.`);
  }
}
