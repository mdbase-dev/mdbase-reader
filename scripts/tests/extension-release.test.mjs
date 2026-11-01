import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  releasePlan,
  tagSnapshot,
  versionParts,
  zipHash,
  submissionBaseline,
  storeReady,
} from "../extension-release.mjs";

function fixture(context) {
  const directory = mkdtempSync(join(tmpdir(), "reader-extension-train-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const cwd = join(directory, "repo");
  mkdirSync(cwd);
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const write = (path, text) => {
    mkdirSync(join(cwd, path, ".."), { recursive: true });
    writeFileSync(join(cwd, path), text);
  };
  const commit = () => {
    git("add", ".");
    git("commit", "-m", "fixture");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
  };
  const zip = (name, version, content = "original", extra = {}) => {
    const root = join(directory, name);
    mkdirSync(root);
    writeFileSync(
      join(root, "manifest.json"),
      JSON.stringify({ name: "mdbase Reader", manifest_version: 3, version, ...extra }),
    );
    writeFileSync(join(root, "main.js"), content);
    const archive = join(directory, `${name}.zip`);
    execFileSync("zip", ["-q", archive, "main.js", "manifest.json"], { cwd: root });
    return archive;
  };
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  write("apps/extension/package.json", '{"name":"extension","version":"0.5.0"}\n');
  commit();
  git("tag", "extension-v0.5.0");
  const baseline = { tag: "extension-v0.5.0", source: git("rev-parse", "HEAD"), runId: 1 };
  const baselineZip = zip("baseline", "0.5.0");
  return {
    cwd,
    directory,
    git,
    write,
    commit,
    zip,
    baseline,
    baselineZip,
    plan: (candidate, selected = baseline) => releasePlan(cwd, selected, candidate, baselineZip),
  };
}

test("ZIP fingerprint ignores version, timestamps and container order, not shipping bytes", (context) => {
  const repo = fixture(context);
  assert.equal(zipHash(repo.baselineZip), zipHash(repo.zip("version", "0.8.0")));
  assert.notEqual(zipHash(repo.baselineZip), zipHash(repo.zip("script", "0.5.0", "new script")));
  assert.notEqual(
    zipHash(repo.baselineZip),
    zipHash(repo.zip("permission", "0.5.0", "original", { permissions: ["storage"] })),
  );
});

test("nonshipping source/test/lock changes do not release an identical ZIP", (context) => {
  const repo = fixture(context);
  for (const path of [
    "scripts/extension-release.mjs",
    "apps/extension/src/test.test.ts",
    "pnpm-lock.yaml",
    "docs/readme.md",
  ])
    repo.write(path, "not shipped");
  repo.commit();
  assert.equal(repo.plan(repo.zip("same", "0.5.0")).changed, false);
});

test("failed higher tags reserve numbers but never replace the successful baseline", (context) => {
  const repo = fixture(context);
  repo.write("apps/extension/package.json", '{"version":"0.5.1"}');
  repo.commit();
  repo.git("tag", "extension-v0.5.1");
  const plan = repo.plan(repo.zip("changed", "0.5.1", "SDK changed"));
  assert.equal(plan.version, "0.5.2");
  assert.deepEqual(plan.baseline, repo.baseline);
  tagSnapshot(repo.cwd, plan);
  assert.equal(repo.git("diff", "--name-only", "main", plan.tag), "apps/extension/package.json");
  repo.git("switch", "main");
  assert.equal(repo.plan(repo.zip("retry", "0.5.1", "SDK changed")).version, "0.5.3");
  const successful = {
    tag: plan.tag,
    source: repo.git("rev-parse", `${plan.tag}^{commit}`),
    runId: 2,
  };
  assert.equal(
    releasePlan(
      repo.cwd,
      successful,
      repo.zip("next", "0.5.1", "SDK changed"),
      repo.zip("successful", "0.5.2", "SDK changed"),
    ).changed,
    false,
  );
});

test("explicit main version is honored even when it is the only shipping change", (context) => {
  const repo = fixture(context);
  repo.write("apps/extension/package.json", '{"version":"0.6.0"}');
  repo.commit();
  const plan = repo.plan(repo.zip("explicit", "0.6.0"));
  assert.equal(plan.version, "0.6.0");
  assert.equal(plan.changed, true);
  tagSnapshot(repo.cwd, plan);
  assert.equal(repo.git("rev-parse", `${plan.tag}^{commit}`), plan.source);
});

test("higher tags outside main fail alertingly even with unchanged ZIP content", (context) => {
  const repo = fixture(context);
  repo.git("switch", "-c", "foreign");
  repo.write("apps/extension/package.json", '{"version":"0.9.0"}');
  repo.write("other.txt", "foreign");
  repo.commit();
  repo.git("tag", "extension-v0.9.0");
  repo.git("switch", "main");
  assert.throws(() => repo.plan(repo.baselineZip), /ALERT.*extension-v0.9.0.*outside main/u);
});

test("dirty/stale plans, mismatched baselines and invalid versions fail closed", (context) => {
  const repo = fixture(context);
  const archive = repo.zip("new", "0.5.0", "new bytes");
  const plan = repo.plan(archive);
  assert.throws(
    () => repo.plan(archive, { ...repo.baseline, source: "a".repeat(40) }),
    /identity mismatch/u,
  );
  repo.write("dirty", "dirty");
  assert.throws(() => repo.plan(archive), /clean/u);
  repo.commit();
  assert.throws(() => tagSnapshot(repo.cwd, plan), /current origin/u);
  for (const version of ["0.0.0", "01.2.3", "1.2.65536", "1.2.3-beta.1", "1.2.3.4"])
    assert.throws(() => versionParts(version));
});

test("baseline requires successful submission step, not green packaging or failed tags", async () => {
  const run = (id, version) => ({
    id,
    event: "push",
    path: ".github/workflows/release.yml",
    head_branch: `extension-v${version}`,
    head_sha: `${id}`.repeat(40),
  });
  const successful = {
    name: "Submit extension to Chrome Web Store",
    conclusion: "success",
    steps: [
      {
        name: "Upload and submit for review",
        conclusion: "success",
        completed_at: "2026-11-01T00:00:00Z",
      },
    ],
  };
  const runs = [run(3, "0.5.2"), run(2, "0.5.1"), run(1, "0.5.0")];
  const selected = await submissionBaseline(runs, async (id) =>
    id === 1 ? [successful] : [{ name: "Package and publish", conclusion: "success" }],
  );
  assert.equal(selected.tag, "extension-v0.5.0");
  await assert.rejects(
    submissionBaseline(runs, async () => []),
    /bootstrap required/u,
  );
  await assert.rejects(
    submissionBaseline(runs, async () => [
      { ...successful, steps: [{ name: "Upload and submit for review", conclusion: "failure" }] },
    ]),
    /bootstrap required/u,
  );
  const rerun = await submissionBaseline(runs, async (id) => [
    {
      ...successful,
      steps: [
        {
          ...successful.steps[0],
          completed_at: id === 1 ? "2026-11-02T00:00:00Z" : "2026-11-01T00:00:00Z",
        },
      ],
    },
  ]);
  assert.equal(rerun.runId, 1);
});

test("pending/staged reviews and in-flight uploads defer without allocating a tag", () => {
  for (const state of ["PENDING_REVIEW", "STAGED"])
    assert.equal(
      storeReady({ itemId: "reader", submittedItemRevisionStatus: { state } }, "reader"),
      false,
    );
  assert.equal(
    storeReady({ itemId: "reader", lastAsyncUploadState: "IN_PROGRESS" }, "reader"),
    false,
  );
  assert.equal(storeReady({ itemId: "reader" }, "reader"), true);
  assert.throws(() => storeReady({ itemId: "other" }, "reader"));
  assert.throws(() => storeReady({ itemId: "reader", warned: true }, "reader"));
});

test("disabled CLI exits before authentication or any tag operation", (context) => {
  const repo = fixture(context);
  const script = fileURLToPath(new URL("../extension-release.mjs", import.meta.url));
  for (const enabled of ["", "false", "TRUE"]) {
    const output = execFileSync(process.execPath, [script, "tag"], {
      cwd: repo.cwd,
      encoding: "utf8",
      env: { ...process.env, EXTENSION_TRAIN_ENABLED: enabled },
    });
    assert.match(output, /disabled/u);
    assert.equal(repo.git("tag", "--list").split("\n").length, 1);
  }
});

test("merge cannot trigger train, regardless of switch; inspection dispatch targets main", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/extension-train.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /schedule:/u);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /^ {2}(push|pull_request|workflow_run):/mu);
  assert.match(
    workflow,
    /if: vars\.EXTENSION_TRAIN_ENABLED == 'true' && github\.ref == 'refs\/heads\/main'/u,
  );
  const release = readFileSync(
    new URL("../../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  assert.match(
    release,
    /if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/u,
  );
});
