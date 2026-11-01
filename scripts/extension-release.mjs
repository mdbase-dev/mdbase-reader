import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const manifestPath = "apps/extension/package.json";
const inputs = [
  "apps/extension",
  "apps/reader/scripts",
  "apps/reader/mdbase",
  "packages",
  "config",
  "tools",
  "vendor",
  "scripts",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "lingui.config.mjs",
  "tsconfig.base.json",
  "tsconfig.json",
];

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export function versionParts(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version)) {
    throw new Error(`Expected a stable three-part Chrome version: ${version}`);
  }
  const parts = version.split(".").map(Number);
  if (parts.some((part) => part > 65535) || parts.every((part) => part === 0)) {
    throw new Error(`Invalid Chrome version: ${version}`);
  }
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

export function releasePlan(cwd = process.cwd()) {
  if (git(cwd, "status", "--porcelain")) throw new Error("Release checkout must be clean.");
  const source = git(cwd, "rev-parse", "HEAD");
  const tags = git(cwd, "tag", "--list", "extension-v*")
    .split("\n")
    .filter((tag) => /^extension-v\d+\.\d+\.\d+$/u.test(tag))
    .sort((left, right) => compareVersions(right.slice(11), left.slice(11)));
  const previousTag = tags[0];
  if (!previousTag) throw new Error("No stable extension tag; bootstrap requires a maintainer.");
  const previousVersion = previousTag.slice(11);
  const previous = manifest(cwd, previousTag);
  if (previous.version !== previousVersion) throw new Error("Previous tag/version mismatch.");
  const isAncestor = (ref) => {
    const result = spawnSync("git", ["merge-base", "--is-ancestor", ref, source], { cwd });
    if (result.status !== 0 && result.status !== 1) throw new Error("Cannot verify tag ancestry.");
    return result.status === 0;
  };
  if (!isAncestor(previousTag)) {
    const parents = git(cwd, "rev-list", "--parents", "-n", "1", previousTag).split(" ").slice(1);
    if (
      parents.length !== 1 ||
      !isAncestor(parents[0]) ||
      git(cwd, "diff", "--name-only", parents[0], previousTag) !== manifestPath ||
      withoutVersion(manifest(cwd, parents[0])) !== withoutVersion(previous)
    ) {
      throw new Error("Latest extension tag is not a main snapshot with a version-only bump.");
    }
  }
  const current = manifest(cwd, source);
  versionParts(current.version);
  const changed = git(cwd, "diff", "--name-only", previousTag, source, "--", ...inputs)
    .split("\n")
    .filter((path) => path && path !== manifestPath);
  if (withoutVersion(previous) !== withoutVersion(current)) changed.push(manifestPath);
  if (!changed.length) return { changed: false, previousTag, source };
  let version = current.version;
  if (compareVersions(version, previousVersion) <= 0) {
    const parts = versionParts(previousVersion);
    parts[2]++;
    version = parts.join(".");
    versionParts(version);
  }
  return { changed: true, previousTag, source, version, tag: `extension-v${version}` };
}

export function tagSnapshot(cwd, plan) {
  const fresh = releasePlan(cwd);
  if (JSON.stringify(fresh) !== JSON.stringify(plan) || !plan.changed) {
    throw new Error("Release plan changed; refusing a stale or empty release.");
  }
  git(cwd, "switch", "--detach", plan.source);
  const current = JSON.parse(readFileSync(`${cwd}/${manifestPath}`, "utf8"));
  if (current.version !== plan.version) {
    writeFileSync(
      `${cwd}/${manifestPath}`,
      `${JSON.stringify({ ...current, version: plan.version }, null, 2)}\n`,
    );
    git(cwd, "add", "--", manifestPath);
  }
  if (git(cwd, "diff", "--cached", "--name-only")) {
    git(cwd, "commit", "-m", `Release ${plan.tag} from main ${plan.source}`);
  }
  git(cwd, "tag", "-a", plan.tag, "-m", `Reader extension from main ${plan.source}`);
  return git(cwd, "rev-parse", "HEAD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const plan = releasePlan();
    console.log(JSON.stringify(plan));
    if (process.argv[2] === "tag" && plan.changed) {
      if (git(process.cwd(), "rev-parse", "refs/remotes/origin/main") !== plan.source) {
        throw new Error("Only the checked-out origin/main snapshot may create a release tag.");
      }
      tagSnapshot(process.cwd(), plan);
      git(process.cwd(), "push", "origin", `refs/tags/${plan.tag}:refs/tags/${plan.tag}`);
    } else if (process.argv[2] && process.argv[2] !== "tag") {
      throw new Error("Use no argument to plan, or tag to create and push the immutable snapshot.");
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
