import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const projectName = "mdbase-reader";
const deploymentOrigin = `https://${projectName}.pages.dev`;
const deploymentTarget = process.env.MDBASE_READER_DEPLOY_TARGET ?? "staging";
if (deploymentTarget !== "staging" && deploymentTarget !== "production") {
  throw new Error(`Unsupported reader deployment target: ${deploymentTarget}.`);
}
const connectUrl =
  deploymentTarget === "production"
    ? "https://connect.mdbase.dev"
    : "https://connect-staging.mdbase.dev";
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const manifestTargets = [
  resolve(projectRoot, "public", ".well-known", "mdbase-app.json"),
  resolve(projectRoot, "src", "generated", "mdbase-app.json"),
];
const originalManifests = await Promise.all(manifestTargets.map((target) => readFile(target)));
const buildId = await capture("git", ["rev-parse", "--short=12", "HEAD"]);

try {
  await run(pnpm, ["build"], {
    ...process.env,
    MDBASE_READER_BUILD_ID: buildId,
    MDBASE_READER_ORIGIN: deploymentOrigin,
    VITE_MDBASE_READER_BUILD_ID: buildId,
    VITE_MDBASE_CONNECT_URL: connectUrl,
    VITE_MDBASE_CONNECT_LOOPBACK_URL: "http://127.0.0.1:28486",
  });
  await verifyDeploymentArtifacts();
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

async function verifyDeploymentArtifacts() {
  const wellKnownDirectory = resolve(projectRoot, "dist", ".well-known");
  const manifest = JSON.parse(
    await readFile(resolve(wellKnownDirectory, "mdbase-app.json"), "utf8"),
  );
  const homepage = `${deploymentOrigin}/`;
  if (
    manifest.homepage !== homepage ||
    manifest.icon !== `${homepage}favicon.svg` ||
    manifest.redirect_uris?.length !== 1 ||
    manifest.redirect_uris[0] !== homepage
  ) {
    throw new Error(`Reader deployment manifest does not declare ${deploymentOrigin}.`);
  }

  const deploymentRevision = JSON.parse(
    await readFile(resolve(wellKnownDirectory, "mdbase-reader-build.json"), "utf8"),
  );
  if (deploymentRevision.revision !== buildId) {
    throw new Error(`Reader deployment revision does not match ${buildId}.`);
  }

  const routes = JSON.parse(await readFile(resolve(projectRoot, "dist", "_routes.json"), "utf8"));
  if (routes.version !== 1 || routes.include?.length !== 1 || routes.include[0] !== "/api/*") {
    throw new Error("Reader deployment routes do not isolate the capture function to /api/*.");
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

async function capture(command, arguments_) {
  const child = spawn(command, arguments_, {
    cwd: projectRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "inherit"],
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  const code = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", resolveExit);
  });
  if (code !== 0) {
    throw new Error(`${command} ${arguments_.join(" ")} exited with status ${String(code)}.`);
  }
  return output.trim();
}
