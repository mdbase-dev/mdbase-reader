import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  artifactBinding,
  buildBinding,
  compareVersions,
  context,
  nextVersion,
  qualify,
  reviewBlock,
  versionParts,
  submitTarget,
} from "../extension-store.mjs";
import { storeLine } from "../extension-store-policy.mjs";

const source = "a".repeat(40);
const workflowSha = "b".repeat(40);
const itemId = "a".repeat(32);
const env = {
  GITHUB_REPOSITORY: "mdbase-dev/mdbase-reader",
  GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_RUN_ATTEMPT: "1",
  GITHUB_RUN_ID: "7",
  GITHUB_SHA: workflowSha,
  GITHUB_WORKFLOW_REF:
    "mdbase-dev/mdbase-reader/.github/workflows/publish-reader-extension.yml@refs/heads/main",
  STORE_TARGET: "extension-chrome",
  SOURCE_SHA: source,
  ARTIFACT_ID: "9",
  ARTIFACT_DIGEST: "c".repeat(64),
};

test("only exact main workflow, first attempt, enrolled target and immutable source", () => {
  context(env);
  for (const extra of [
    { GITHUB_REF: "refs/tags/extension-v1.0.0" },
    { GITHUB_RUN_ATTEMPT: "2" },
    { STORE_TARGET: "firefox" },
    { SOURCE_SHA: "main" },
    { GITHUB_WORKFLOW_REF: "other" },
    { GITHUB_EVENT_NAME: "push" },
    { GITHUB_REPOSITORY: "other/repo" },
  ])
    assert.throws(() => context({ ...env, ...extra }));
});

test("version exceeds live store and every permanent reservation, not just manifest", () => {
  assert.equal(nextVersion("0.5.0", ["0.5.1"]), "0.5.2");
  assert.equal(nextVersion("0.5.0", ["0.5.1", "0.5.3"]), "0.5.4");
  assert.equal(nextVersion("1.0.0", ["0.5.9"]), "1.0.0");
  assert.equal(nextVersion("1.0.0", ["1.0.0"]), "1.0.1");
  assert.equal(nextVersion("1.0.0", ["1.0.0.9"]), "1.0.0.10");
  assert.equal(compareVersions("1.0.1", "1.0.0.65535") > 0, true);
  for (const value of ["0.0.0", "1.2.65536", "01.2.3", "1.2.3-beta.1", "1.2", "1.2.3.4.5"])
    assert.throws(() => versionParts(value));
  assert.throws(() => nextVersion("1.2.3", ["1.2.65535"]));
});

test("never replaces an in-flight submission; rejection and policy errors fail closed", () => {
  for (const state of ["PENDING_REVIEW", "STAGED"])
    assert.equal(
      reviewBlock({ itemId, submittedItemRevisionStatus: { state } }, itemId),
      "pending-review",
    );
  assert.equal(
    reviewBlock({ itemId, lastAsyncUploadState: "IN_PROGRESS" }, itemId),
    "pending-review",
  );
  assert.equal(
    reviewBlock({ itemId, submittedItemRevisionStatus: { state: "PUBLISHED" } }, itemId),
    null,
  );
  for (const state of ["REJECTED", "CANCELLED", "UNKNOWN"])
    assert.throws(() => reviewBlock({ itemId, submittedItemRevisionStatus: { state } }, itemId));
  for (const extra of [
    { itemId: "other" },
    { warned: true },
    { takenDown: true },
    { lastAsyncUploadState: "FAILED" },
  ])
    assert.throws(() => reviewBlock({ itemId, ...extra }, itemId));
});

function policyFixture(overrides = {}) {
  const calls = [];
  const run = {
    id: 12,
    run_attempt: 2,
    head_sha: source,
    head_branch: "main",
    event: "push",
    path: ".github/workflows/ci.yml",
    status: "completed",
    conclusion: "success",
    ...overrides.run,
  };
  const check = overrides.check ?? { workflow: "ci.yml", jobs: ["repo-ci", "extension-package"] };
  const jobs = ["repo-ci", "extension-package"].map((name) => ({
    name,
    run_id: 12,
    run_attempt: 2,
    status: "completed",
    conclusion: "success",
    ...(name === "extension-package" ? overrides.job : {}),
  }));
  return {
    calls,
    lineState: async () => ({
      app: "reader-extension-chrome",
      stopped: (overrides.issues ?? []).some((issue) =>
        issue.body.includes("<!-- mdbase-app-line:reader-extension-chrome -->"),
      ),
      app_stopped: (overrides.issues ?? []).some((issue) =>
        issue.body.includes("<!-- mdbase-app-line:reader -->"),
      ),
    }),
    transport: (path) => {
      calls.push(path);
      const content = (value) => ({
        content: Buffer.from(JSON.stringify(value)).toString("base64"),
      });
      if (path.includes("contents/config/app-cd.json"))
        return content({
          reader: {
            repository: env.GITHUB_REPOSITORY,
            ci: "ci.yml",
            store_workflow: "publish-reader-extension.yml",
            store_targets: ["extension-chrome"],
          },
        });
      if (path.includes("contents/config/client-apps.json"))
        return content([
          { repository: env.GITHUB_REPOSITORY, store_checks: { "extension-chrome": [check] } },
        ]);
      if (path.includes("/issues?")) return [overrides.issues ?? []];
      if (path.includes("/compare/")) return { status: overrides.ancestry ?? "ahead" };
      if (path.includes("/jobs?")) return [{ jobs: overrides.jobs ?? jobs }];
      if (path.includes("/runs?")) return { workflow_runs: overrides.runs ?? [run] };
      throw new Error(`Unexpected request ${path}`);
    },
  };
}

test("canonical ops config supplies checks and named jobs bound to exact latest attempt", async () => {
  const fixture = policyFixture();
  assert.equal(await qualify(source, fixture.transport, fixture.lineState), null);
  assert.ok(fixture.calls.some((path) => path.includes("/attempts/2/jobs?")));
  assert.ok(fixture.calls.some((path) => path.includes("config/client-apps.json?ref=main")));
});

test("pending, failed, missing, duplicate and wrong-attempt checks skip before any mutation", async () => {
  for (const extra of [
    { run: { status: "in_progress", conclusion: null } },
    { run: { conclusion: "failure" } },
    { runs: [] },
    { jobs: [] },
    { job: { conclusion: "skipped" } },
    { job: { run_id: 99 } },
    { job: { run_attempt: 1 } },
  ]) {
    const fixture = policyFixture(extra);
    assert.equal(
      await qualify(source, fixture.transport, fixture.lineState),
      "no-qualified-source",
    );
  }
  const fixture = policyFixture({ check: { workflow: "ci.yml", jobs: [] } });
  await assert.rejects(
    qualify(source, fixture.transport, fixture.lineState),
    /store-check-policy-required/,
  );
});

test("only Reader or its own extension line holds apply", async () => {
  for (const line of ["reader", "reader-extension-chrome", "writer", "tasknotes-google-play"]) {
    const fixture = policyFixture({ issues: [{ body: `<!-- mdbase-app-line:${line} -->` }] });
    assert.equal(
      await qualify(source, fixture.transport, fixture.lineState),
      line.startsWith("reader") ? "app-line-stopped" : null,
    );
  }
});

test("artifact binds full run identity, immutable digest and workflow; payload binds source/tree/version/producer", () => {
  const metadata = {
    id: 9,
    expired: false,
    digest: `sha256:${env.ARTIFACT_DIGEST}`,
    name: "reader-extension-build-7",
    workflow_run: { id: 7, head_sha: workflowSha },
  };
  const run = {
    id: 7,
    run_attempt: 1,
    head_sha: workflowSha,
    path: ".github/workflows/publish-reader-extension.yml",
    event: "workflow_dispatch",
    head_branch: "main",
    repository: { full_name: env.GITHUB_REPOSITORY },
  };
  artifactBinding(metadata, run, env);
  for (const extra of [
    { id: 8 },
    { expired: true },
    { name: "other" },
    { digest: "sha256:other" },
    { workflow_run: { id: 8, head_sha: workflowSha } },
  ])
    assert.throws(() => artifactBinding({ ...metadata, ...extra }, run, env));
  for (const extra of [
    { id: 8 },
    { run_attempt: 2 },
    { head_sha: source },
    { path: ".github/workflows/release.yml" },
    { event: "push" },
    { head_branch: "other" },
    { repository: { full_name: "other/repo" } },
  ])
    assert.throws(() => artifactBinding(metadata, { ...run, ...extra }, env));
  const binding = buildBinding(
    { sha: source, tree: workflowSha, sdkTrust: { authentication: { source } } },
    "0.5.2",
    Buffer.from("package"),
    env,
  );
  assert.equal(binding.source, source);
  assert.equal(binding.producer, source);
  assert.equal(binding.version, "0.5.2");
  assert.match(binding.sha256, /^[a-f0-9]{64}$/);
});

test("single serialized store path; candidate build has no store credentials or environment", async () => {
  const yaml = await readFile(
    new URL("../../.github/workflows/publish-reader-extension.yml", import.meta.url),
    "utf8",
  );
  const build = yaml.split("\n  build:\n")[1].split("\n  publish:\n")[0];
  assert.ok(yaml.includes("group: reader-chrome-web-store"));
  assert.ok(yaml.includes("cancel-in-progress: false"));
  assert.ok(
    !build.includes("secrets.") && !build.includes("environment:") && !build.includes("CWS_"),
  );
  assert.ok(build.includes("--frozen-lockfile --ignore-scripts --ignore-pnpmfile"));
  assert.ok(yaml.includes("reader-store-extension-chrome-${{ github.run_id }}"));
  assert.ok(!yaml.includes("permission-issues"));
  const legacy = await readFile(
    new URL("../../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  assert.ok(
    !legacy.includes("extension-v") &&
      !legacy.includes("webstore") &&
      !legacy.includes("workflow_dispatch"),
  );
});

function submissionFixture(state = { itemId }, failure = null) {
  const calls = [];
  const receipts = [];
  let writes = false;
  let guards = 0;
  const services = {
    status: async () => state,
    guard: async () => {
      calls.push("guard");
      guards++;
      if (failure === `guard-${guards}`) throw new Error("exact-main-ci-required");
    },
    save: async (receipt) => {
      calls.push(receipt.outcome ?? "write-started");
      receipts.push(receipt);
      writes ||= receipt.write_started === true;
    },
    reserve: async () => {
      calls.push("reserve");
    },
    release: async () => {
      calls.push("release");
    },
    upload: async ({ beforeUpload, beforeSubmit }) => {
      await beforeUpload();
      assert.ok(writes);
      calls.push("upload");
      if (failure === "upload") throw new Error("store-upload-failed");
      await beforeSubmit();
      calls.push("submit");
      if (failure === "submit") throw new Error("store-submission-failed");
      return "PENDING_REVIEW";
    },
  };
  return { calls, receipts, services };
}

test("pending review and rejection never reserve, release, upload or replace a submission", async () => {
  const pending = submissionFixture({
    itemId,
    submittedItemRevisionStatus: { state: "PENDING_REVIEW" },
  });
  await submitTarget({ itemId, services: pending.services });
  assert.deepEqual(pending.calls, ["pending-review"]);
  const rejected = submissionFixture({
    itemId,
    submittedItemRevisionStatus: { state: "REJECTED" },
  });
  await assert.rejects(submitTarget({ itemId, services: rejected.services }), /store-rejected/);
  assert.deepEqual(rejected.calls, []);
});

test("permanent version reservation and verified GitHub release precede a single store write", async () => {
  const fixture = submissionFixture();
  await submitTarget({ itemId, services: fixture.services });
  assert.deepEqual(fixture.calls, [
    "guard",
    "reserving",
    "reserve",
    "release",
    "uploading",
    "guard",
    "write-started",
    "upload",
    "guard",
    "submit",
    "submitted",
  ]);
  assert.equal(fixture.receipts.at(-1).state, "PENDING_REVIEW");
});

test("failed uploads, submissions and raced gates never retry or lose the write boundary", async () => {
  for (const failure of ["upload", "submit", "guard-1", "guard-2", "guard-3"]) {
    const fixture = submissionFixture({ itemId }, failure);
    await assert.rejects(submitTarget({ itemId, services: fixture.services }));
    assert.equal(
      fixture.calls.filter((call) => call === "upload").length,
      ["upload", "submit", "guard-3"].includes(failure) ? 1 : 0,
    );
    assert.equal(
      fixture.calls.filter((call) => call === "reserve").length,
      failure === "guard-1" ? 0 : 1,
    );
    assert.equal(
      fixture.receipts.some((receipt) => receipt.write_started),
      ["upload", "submit", "guard-3"].includes(failure),
    );
    assert.ok(!fixture.calls.includes("submitted"));
  }
});

test("store-line bridge follows only the returned first-attempt run and exact artifact", async () => {
  const state = { app: "reader-extension-chrome", stopped: false, app_stopped: false };
  const bytes = execFileSync("python3", [
    "-c",
    "import io,json,sys,zipfile; output=io.BytesIO(); archive=zipfile.ZipFile(output,'w'); archive.writestr('store-line.json',sys.argv[1]); archive.close(); sys.stdout.buffer.write(output.getvalue())",
    JSON.stringify(state),
  ]);
  const run = {
    id: 71,
    path: ".github/workflows/tasknotes-store-line.yml",
    head_branch: "main",
    event: "workflow_dispatch",
    run_attempt: 1,
    repository: { full_name: "mdbase-dev/mdbase-cloud-ops" },
    status: "completed",
    conclusion: "success",
  };
  const fixture =
    (changed = {}, artifacts = [{ id: 81, name: "tasknotes-store-line", expired: false }]) =>
    (path, options) => {
      assert.ok(!path.includes("/issues"));
      if (path.endsWith("/dispatches")) {
        assert.deepEqual(options.body.inputs, {
          app: "reader",
          store: "extension-chrome",
          operation: "status",
          reason: "app-outcome-unknown",
        });
        return { workflow_run_id: 71 };
      }
      if (path.endsWith("/runs/71")) return { ...run, ...changed };
      if (path.includes("/runs/71/artifacts")) return { artifacts };
      if (path.endsWith("/artifacts/81/zip")) return bytes;
      throw new Error("unexpected-request");
    };
  assert.deepEqual(await storeLine(fixture()), state);
  for (const changed of [
    { id: 72 },
    { run_attempt: 2 },
    { head_branch: "other" },
    { path: "other" },
    { repository: { full_name: "other/repo" } },
    { conclusion: "failure" },
  ])
    await assert.rejects(storeLine(fixture(changed)));
  await assert.rejects(storeLine(fixture({}, [])), /store-line-artifact-required/);
});
