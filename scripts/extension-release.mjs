import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inspectWebstore, validateStatus } from "../apps/extension/scripts/publish-webstore.mjs";

const manifestPath = "apps/extension/package.json";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export function versionParts(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version))
    throw new Error(`Expected a stable three-part Chrome version: ${version}`);
  const parts = version.split(".").map(Number);
  if (parts.some((part) => part > 65535) || parts.every((part) => part === 0))
    throw new Error(`Invalid Chrome version: ${version}`);
  return parts;
}

function compareVersions(left, right) {
  const previous = versionParts(right);
  return versionParts(left).reduce(
    (comparison, part, index) => comparison || part - previous[index],
    0,
  );
}

function manifest(cwd, ref) {
  return JSON.parse(git(cwd, "show", `${ref}:${manifestPath}`));
}

function withoutVersion(value) {
  const copy = { ...value };
  delete copy.version;
  return JSON.stringify(copy);
}

export function zipHash(archive) {
  return execFileSync("python3", [resolve(import.meta.dirname, "extension-zip-hash.py"), archive], {
    encoding: "utf8",
  }).trim();
}

export async function submissionBaseline(runs, jobsForRun) {
  const submissions = [];
  for (const run of [...runs].sort((left, right) => right.id - left.id)) {
    if (
      run.event !== "push" ||
      run.path !== ".github/workflows/release.yml" ||
      !/^extension-v\d+\.\d+\.\d+$/u.test(run.head_branch)
    )
      continue;
    const jobs = await jobsForRun(run.id);
    const step = jobs
      .find((job) => job.name === "Submit extension to Chrome Web Store")
      ?.steps?.find(
        (entry) => entry.name === "Upload and submit for review" && entry.conclusion === "success",
      );
    if (step)
      submissions.push({
        tag: run.head_branch,
        source: run.head_sha,
        runId: run.id,
        completed: Date.parse(step.completed_at ?? run.updated_at),
      });
  }
  if (submissions.length) {
    const { completed, ...baseline } = submissions.sort(
      (left, right) => right.completed - left.completed || right.runId - left.runId,
    )[0];
    if (!Number.isFinite(completed))
      throw new Error("Successful submission has no completion timestamp.");
    return baseline;
  }
  throw new Error(
    "No release.yml run proves a successful Web Store submission. Maintainer bootstrap required; a packaged GitHub release is not a baseline.",
  );
}

export function releasePlan(cwd, baseline, candidateZip, baselineZip) {
  if (git(cwd, "status", "--porcelain")) throw new Error("Release checkout must be clean.");
  const source = git(cwd, "rev-parse", "HEAD");
  const tags = git(cwd, "tag", "--list", "extension-v*")
    .split("\n")
    .filter((tag) => /^extension-v\d+\.\d+\.\d+$/u.test(tag))
    .sort((left, right) => compareVersions(right.slice(11), left.slice(11)));
  if (
    !baseline ||
    !tags.includes(baseline.tag) ||
    git(cwd, "rev-parse", `${baseline.tag}^{commit}`) !== baseline.source
  )
    throw new Error("Successful submission baseline/tag identity mismatch.");
  const isAncestor = (ref) => {
    const result = spawnSync("git", ["merge-base", "--is-ancestor", ref, source], { cwd });
    if (result.status !== 0 && result.status !== 1) throw new Error("Cannot verify tag ancestry.");
    return result.status === 0;
  };
  for (const tag of tags) {
    if (manifest(cwd, tag).version !== tag.slice(11))
      throw new Error(`Tag/version mismatch: ${tag}`);
    if (!isAncestor(tag)) {
      const parents = git(cwd, "rev-list", "--parents", "-n", "1", tag).split(" ").slice(1);
      if (
        parents.length !== 1 ||
        !isAncestor(parents[0]) ||
        git(cwd, "diff", "--name-only", parents[0], tag) !== manifestPath ||
        withoutVersion(manifest(cwd, parents[0])) !== withoutVersion(manifest(cwd, tag))
      )
        throw new Error(
          `ALERT: extension tag ${tag} is outside main and is not a version-only main snapshot. Investigate before releasing.`,
        );
    }
  }
  const declared = manifest(cwd, source).version;
  versionParts(declared);
  const highest = tags[0].slice(11);
  const explicitVersion = compareVersions(declared, highest) > 0;
  const candidateHash = zipHash(candidateZip);
  const baselineHash = zipHash(baselineZip);
  if (candidateHash === baselineHash && !explicitVersion)
    return { changed: false, source, baseline, candidateHash, baselineHash };
  let version = declared;
  if (!explicitVersion) {
    const parts = versionParts(highest);
    parts[2]++;
    version = parts.join(".");
    versionParts(version);
  }
  return {
    changed: true,
    source,
    baseline,
    candidateHash,
    baselineHash,
    version,
    tag: `extension-v${version}`,
  };
}

export function tagSnapshot(cwd, plan) {
  if (
    !plan.changed ||
    git(cwd, "status", "--porcelain") ||
    git(cwd, "rev-parse", "HEAD") !== plan.source ||
    git(cwd, "rev-parse", "refs/remotes/origin/main") !== plan.source
  )
    throw new Error("Only a clean, current origin/main release plan may tag.");
  git(cwd, "switch", "--detach", plan.source);
  const current = JSON.parse(readFileSync(join(cwd, manifestPath), "utf8"));
  if (current.version !== plan.version) {
    writeFileSync(
      join(cwd, manifestPath),
      `${JSON.stringify({ ...current, version: plan.version }, null, 2)}\n`,
    );
    git(cwd, "add", "--", manifestPath);
    git(cwd, "commit", "-m", `Release ${plan.tag} from main ${plan.source}`);
  }
  git(cwd, "tag", "-a", plan.tag, "-m", `Reader extension from main ${plan.source}`);
}

export function storeReady(status, itemId) {
  if (status.itemId !== itemId) throw new Error("Web Store returned an unexpected item ID.");
  if (status.warned || status.takenDown) throw new Error("Resolve Web Store policy issues first.");
  return (
    !["PENDING_REVIEW", "STAGED"].includes(status.submittedItemRevisionStatus?.state) &&
    status.lastAsyncUploadState !== "IN_PROGRESS"
  );
}

function api(repository, path) {
  return JSON.parse(
    execFileSync("gh", ["api", "--paginate", "--slurp", `repos/${repository}/${path}`], {
      encoding: "utf8",
    }),
  );
}

async function main() {
  if (process.env.EXTENSION_TRAIN_ENABLED !== "true") {
    console.log("Extension train disabled; no credentials, build or tag required.");
    return;
  }
  if (!["preflight", "tag"].includes(process.argv[2]))
    throw new Error("Expected preflight or tag.");
  const itemId = process.env.CWS_ITEM_ID;
  const status = await inspectWebstore({
    publisherId: process.env.CWS_PUBLISHER_ID,
    itemId,
    token: process.env.CWS_ACCESS_TOKEN,
  });
  const ready = storeReady(status, itemId);
  if (process.argv[2] === "preflight") {
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `ready=${ready}\n`);
    console.log(
      ready
        ? "Store ready for content comparison."
        : "Store submission/upload pending; defer without tagging.",
    );
    return;
  }
  if (!ready) {
    console.log("Store submission/upload pending; defer without tagging.");
    return;
  }
  const repository = process.env.GITHUB_REPOSITORY;
  if (repository !== "mdbase-dev/mdbase-reader") throw new Error("Unexpected release repository.");
  const runs = api(
    repository,
    "actions/workflows/release.yml/runs?event=push&per_page=100",
  ).flatMap((page) => page.workflow_runs);
  if (
    runs.some(
      (run) =>
        /^extension-v/u.test(run.head_branch) &&
        ["queued", "in_progress", "waiting", "pending", "requested"].includes(run.status),
    )
  ) {
    console.log("An extension release is still running; defer without tagging.");
    return;
  }
  const baseline = await submissionBaseline(runs, async (id) =>
    api(repository, `actions/runs/${id}/jobs?per_page=100`).flatMap((page) => page.jobs),
  );
  const directory = join(process.env.RUNNER_TEMP, "extension-baseline");
  mkdirSync(directory, { recursive: true });
  const archive = `mdbase-reader-${baseline.tag.slice(11)}.zip`;
  execFileSync(
    "gh",
    [
      "release",
      "download",
      baseline.tag,
      "--repo",
      repository,
      "--pattern",
      archive,
      "--pattern",
      "SHA256SUMS",
      "--dir",
      directory,
    ],
    { stdio: "inherit" },
  );
  const expected = readFileSync(join(directory, "SHA256SUMS"), "utf8")
    .split("\n")
    .find((line) => line.split(/\s+/u)[1] === archive)
    ?.split(/\s+/u)[0];
  if (
    !expected ||
    createHash("sha256")
      .update(readFileSync(join(directory, archive)))
      .digest("hex") !== expected
  )
    throw new Error("Baseline ZIP checksum mismatch or missing.");
  const cwd = process.cwd();
  const declared = manifest(cwd, "HEAD").version;
  const plan = releasePlan(
    cwd,
    baseline,
    join(cwd, `apps/extension/release/mdbase-reader-${declared}.zip`),
    join(directory, archive),
  );
  console.log(JSON.stringify(plan));
  if (!plan.changed) return;
  validateStatus(status, itemId, plan.version);
  tagSnapshot(cwd, plan);
  git(cwd, "push", "origin", `refs/tags/${plan.tag}:refs/tags/${plan.tag}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
