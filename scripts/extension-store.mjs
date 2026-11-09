import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  inspectWebstore,
  publishWebstore,
  validateRelease,
} from "../apps/extension/scripts/publish-webstore.mjs";
import { sourcePlan } from "./publisher/publisher.mjs";
import { compareInstalled } from "./publisher/originals.mjs";
import { compatible } from "./publisher/compatibility.mjs";

import {
  repository,
  workflow,
  target,
  hash,
  need,
  json,
  gh,
  githubContent,
  versionParts,
  nextVersion,
  reviewBlock,
  context,
  qualify,
  artifactJson,
} from "./extension-store-policy.mjs";
export {
  compareVersions,
  context,
  nextVersion,
  qualify,
  reviewBlock,
  versionParts,
} from "./extension-store-policy.mjs";
const storeOptions = () => ({
  publisherId: process.env.CWS_PUBLISHER_ID,
  itemId: process.env.CWS_ITEM_ID,
  token: process.env.CWS_ACCESS_TOKEN,
});
const receiptPath = () => resolve(process.env.STORE_RECEIPT ?? "store-cd-result.json");
async function save(value) {
  let previous = {};
  try {
    previous = await json(receiptPath());
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(
    receiptPath(),
    JSON.stringify(
      {
        schema: "reader/store-cd/1",
        target,
        source: process.env.SOURCE_SHA,
        run_id: Number(process.env.GITHUB_RUN_ID),
        write_started: false,
        ...previous,
        ...value,
      },
      null,
      2,
    ) + "\n",
  );
}
async function defer(reason) {
  return save({
    outcome: "stopped",
    reason: reason === "no-qualified-source" ? "exact-main-ci-required" : reason,
  });
}
async function previousSubmission(source, versions) {
  try {
    return await readPreviousSubmission(source, versions);
  } catch (error) {
    throw Object.assign(error, { reason: error.reason ?? "release-evidence-unavailable" });
  }
}
async function readPreviousSubmission(source, versions) {
  const pages = gh(
    `repos/${repository}/actions/workflows/${workflow}/runs?branch=main&event=workflow_dispatch&per_page=100`,
    { pages: true },
  );
  for (const run of pages.flatMap((page) => page.workflow_runs)) {
    if (
      run.status !== "completed" ||
      run.run_attempt !== 1 ||
      run.path !== `.github/workflows/${workflow}` ||
      run.event !== "workflow_dispatch" ||
      run.head_branch !== "main"
    )
      continue;
    const name = `reader-store-${target}-${run.id}`;
    const artifacts = gh(
      `repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`,
    ).artifacts.filter((artifact) => artifact.name === name && !artifact.expired);
    if (artifacts.length !== 1) continue;
    const bytes = gh(`repos/${repository}/actions/artifacts/${artifacts[0].id}/zip`, { raw: true });
    const result = artifactJson(bytes, "store-cd-result.json");
    if (
      result.schema === "reader/store-cd/1" &&
      result.source === source &&
      result.target === target &&
      result.run_id === run.id &&
      ["submitted", "already-live"].includes(result.outcome) &&
      versions.includes(result.version)
    )
      return result.version;
  }
  return null;
}
async function prepare() {
  const blocked = await qualify(process.env.SOURCE_SHA);
  if (blocked) return defer(blocked);
  const status = await inspectWebstore(storeOptions());
  const queue = reviewBlock(status, process.env.CWS_ITEM_ID);
  if (queue) return save({ outcome: queue });
  const versions = (status.publishedItemRevisionStatus?.distributionChannels ?? []).map(
    (channel) => channel.crxVersion,
  );
  need(versions.length > 0, "existing-store-listing-required");
  const previous = await previousSubmission(process.env.SOURCE_SHA, versions);
  if (previous) return save({ outcome: "already-live", version: previous });
  const tags = gh(`repos/${repository}/git/matching-refs/tags/extension-v`, { pages: true })
    .flat()
    .map((tag) => tag.ref.match(/^refs\/tags\/extension-v(\d+\.\d+\.\d+(?:\.\d+)?)$/)?.[1])
    .filter(Boolean);
  const pkg = gh(
    `repos/${repository}/contents/apps/extension/package.json?ref=${process.env.SOURCE_SHA}`,
  );
  const version = nextVersion(githubContent(pkg).version, [...versions, ...tags]);
  await save({ outcome: "building", version });
  await appendFile(process.env.GITHUB_OUTPUT, `ready=true\nversion=${version}\n`);
}
export function buildBinding(plan, version, bytes, env = process.env) {
  return {
    source: plan.sha,
    tree: plan.tree,
    version,
    sha256: hash(bytes),
    producer: plan.sdkTrust.authentication.source,
    run_id: Number(env.GITHUB_RUN_ID),
    workflow_sha: env.GITHUB_SHA,
    target,
  };
}
async function build(output) {
  await mkdir(output, { recursive: true });
  const plan = await sourcePlan();
  await writeFile(join(output, "plan.json"), JSON.stringify(plan, null, 2) + "\n");
}
async function packageBuild(output) {
  const plan = await json(join(output, "plan.json"));
  await compareInstalled(process.cwd(), plan.sdkTrust.archives);
  const packagePath = "apps/extension/package.json";
  const pkg = await json(packagePath);
  versionParts(process.env.EXTENSION_VERSION);
  pkg.version = process.env.EXTENSION_VERSION;
  await writeFile(packagePath, JSON.stringify(pkg, null, 2) + "\n");
  const env = {
    ...process.env,
    MDBASE_ENV: "production",
    GITHUB_TOKEN: "",
    GH_TOKEN: "",
    APP_EVIDENCE_GH_TOKEN: "",
    READER_RELEASE_TOKEN: "",
  };
  execFileSync("pnpm", ["rebuild", "--pending"], { env, stdio: "inherit" });
  execFileSync("pnpm", ["--filter", "@mdbase-reader/extension", "package"], {
    env,
    stdio: "inherit",
  });
  const archive = join(output, "package.zip");
  await cp(`apps/extension/release/mdbase-reader-${pkg.version}.zip`, archive);
  const bytes = await readFile(archive);
  validateRelease(
    `extension-v${pkg.version}`,
    JSON.parse(execFileSync("unzip", ["-p", archive, "manifest.json"], { encoding: "utf8" })),
  );
  await writeFile(
    join(output, "extension-build.json"),
    JSON.stringify(buildBinding(plan, pkg.version, bytes), null, 2) + "\n",
  );
  await writeFile(join(output, "SHA256SUMS"), `${hash(bytes)}  package.zip\n`);
}
export function artifactBinding(metadata, run, env = process.env) {
  need(
    metadata.id === Number(env.ARTIFACT_ID) &&
      !metadata.expired &&
      metadata.digest === `sha256:${env.ARTIFACT_DIGEST}` &&
      metadata.name === `reader-extension-build-${env.GITHUB_RUN_ID}` &&
      metadata.workflow_run?.id === Number(env.GITHUB_RUN_ID) &&
      metadata.workflow_run?.head_sha === env.GITHUB_SHA &&
      run.id === Number(env.GITHUB_RUN_ID) &&
      run.head_sha === env.GITHUB_SHA &&
      run.run_attempt === 1 &&
      run.path === `.github/workflows/${workflow}` &&
      run.event === "workflow_dispatch" &&
      run.head_branch === "main" &&
      run.repository?.full_name === repository,
    "immutable-store-artifact-required",
  );
}
async function publish(output) {
  const blocked = await qualify(process.env.SOURCE_SHA);
  if (blocked) return defer(blocked);
  const plan = await sourcePlan();
  const metadata = gh(`repos/${repository}/actions/artifacts/${process.env.ARTIFACT_ID}`);
  const run = gh(`repos/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`);
  artifactBinding(metadata, run);
  const bytes = gh(`repos/${repository}/actions/artifacts/${process.env.ARTIFACT_ID}/zip`, {
    raw: true,
  });
  need(hash(bytes) === process.env.ARTIFACT_DIGEST, "immutable-artifact-digest-required");
  await mkdir(output, { recursive: true });
  execFileSync(
    "python3",
    [
      "-c",
      "import sys,io,zipfile,pathlib; archive=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); names=['plan.json','extension-build.json','SHA256SUMS','package.zip']; assert sorted(archive.namelist())==sorted(names); assert all(archive.getinfo(name).file_size<100*1024*1024 for name in names); root=pathlib.Path(sys.argv[1]); [(root/name).write_bytes(archive.read(name)) for name in names]",
      output,
    ],
    { input: bytes },
  );
  assert.deepEqual(await json(join(output, "plan.json")), plan);
  const archive = await readFile(join(output, "package.zip"));
  const version = process.env.EXTENSION_VERSION;
  assert.deepEqual(
    await json(join(output, "extension-build.json")),
    buildBinding(plan, version, archive),
  );
  need(
    (await readFile(join(output, "SHA256SUMS"), "utf8")) === `${hash(archive)}  package.zip\n`,
    "package-digest-required",
  );
  validateRelease(
    `extension-v${version}`,
    JSON.parse(
      execFileSync("unzip", ["-p", join(output, "package.zip"), "manifest.json"], {
        encoding: "utf8",
      }),
    ),
  );
  await save({ version, sha256: hash(archive), outcome: "qualifying" });
  if (
    !(await compatible(plan.sdkTrust.authentication.source, {
      token: process.env.APP_EVIDENCE_GH_TOKEN,
    }))
  )
    return save({ outcome: "production-contract-wait" });
  const guard = async () => {
    const refusal = await qualify(process.env.SOURCE_SHA);
    need(!refusal, refusal);
    need(
      await compatible(plan.sdkTrust.authentication.source, {
        token: process.env.APP_EVIDENCE_GH_TOKEN,
      }),
      "production-contract-wait",
    );
  };
  return submitTarget({
    version,
    archive,
    itemId: process.env.CWS_ITEM_ID,
    services: {
      status: () => inspectWebstore(storeOptions()),
      guard,
      save,
      reserve: () =>
        gh(`repos/${repository}/git/refs`, {
          method: "POST",
          body: { ref: `refs/tags/extension-v${version}`, sha: plan.sha },
        }),
      release: async () => {
        const directory = join(output, "release");
        const name = `mdbase-reader-${version}.zip`;
        await mkdir(directory);
        await cp(join(output, "package.zip"), join(directory, name));
        await writeFile(join(directory, "SHA256SUMS"), `${hash(archive)}  ${name}\n`);
        await writeFile(
          join(directory, "notes.md"),
          `Built from \`${plan.sha}\` by [run ${process.env.GITHUB_RUN_ID}](https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}) for production.\n\nSHA256: \`${hash(archive)}\`\n`,
        );
        execFileSync(
          "gh",
          [
            "release",
            "create",
            `extension-v${version}`,
            "--repo",
            repository,
            "--verify-tag",
            "--title",
            `Browser extension ${version}`,
            "--notes-file",
            join(directory, "notes.md"),
            "--",
            join(directory, name),
            join(directory, "SHA256SUMS"),
          ],
          {
            env: { ...process.env, GH_TOKEN: process.env.READER_RELEASE_TOKEN },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
      },
      upload: (callbacks) => publishWebstore({ ...storeOptions(), version, archive, ...callbacks }),
    },
  });
}
export async function submitTarget({ itemId, services }) {
  const state = await services.status();
  const queue = reviewBlock(state, itemId);
  if (queue) return services.save({ outcome: queue });
  await services.guard();
  await services.save({ outcome: "reserving" });
  await services.reserve();
  await services.release();
  await services.save({ outcome: "uploading" });
  const result = await services.upload({
    beforeUpload: async () => {
      await services.guard();
      await services.save({ write_started: true });
    },
    beforeSubmit: services.guard,
  });
  await services.save({ outcome: "submitted", state: result });
}
async function main() {
  context();
  const [command, output] = process.argv.slice(2);
  if (command === "build-plan") return build(output);
  if (command === "package") return packageBuild(output);
  if (command === "prepare") return prepare();
  if (command === "publish") return publish(output);
  if (command === "finish") {
    const results = [
      process.env.PREPARE_RESULT,
      process.env.BUILD_RESULT,
      process.env.PUBLISH_RESULT,
    ];
    if (results.some((value) => ["failure", "cancelled"].includes(value))) {
      let previous;
      try {
        previous = await json(receiptPath());
      } catch {
        previous = {};
      }
      if (previous.outcome !== "stopped")
        await save({ outcome: "stopped", reason: "app-publication-failed" });
    }
    return;
  }
  throw new Error("unknown-extension-store-command");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    let previous;
    try {
      previous = await json(receiptPath());
    } catch {
      previous = {};
    }
    let reason = error.reason ?? "app-publication-failed";
    if (reason === "no-qualified-source") reason = "exact-main-ci-required";
    const waiting =
      previous.write_started !== true &&
      ["app-line-stopped", "exact-main-ci-required", "production-contract-wait"].includes(reason);
    await save({
      outcome: waiting && reason === "production-contract-wait" ? reason : "stopped",
      reason,
    });
    console.error(
      waiting
        ? reason
        : "Extension target stopped; inspect its bounded outcome and store dashboard.",
    );
    if (!waiting) process.exitCode = 1;
  }
}
