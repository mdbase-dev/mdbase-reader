import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const source = "a".repeat(40);
const itemId = "a".repeat(32);
const script = fileURLToPath(new URL("../extension-store.mjs", import.meta.url));
const env = {
  GITHUB_REPOSITORY: "mdbase-dev/mdbase-reader",
  GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_RUN_ATTEMPT: "1",
  GITHUB_RUN_ID: "7",
  GITHUB_WORKFLOW_REF:
    "mdbase-dev/mdbase-reader/.github/workflows/publish-reader-extension.yml@refs/heads/main",
  STORE_TARGET: "extension-chrome",
  SOURCE_SHA: source,
  CWS_PUBLISHER_ID: "a".repeat(36),
  CWS_ITEM_ID: itemId,
  CWS_ACCESS_TOKEN: "test-only-token",
};

async function fixture(run, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "reader-extension-store-"));
  try {
    const state = { app: "reader-extension-chrome", stopped: false, app_stopped: false };
    const archive = execFileSync("python3", [
      "-c",
      "import io,json,sys,zipfile; output=io.BytesIO(); archive=zipfile.ZipFile(output,'w'); archive.writestr('store-line.json',sys.argv[1]); archive.close(); sys.stdout.buffer.write(output.getvalue())",
      JSON.stringify(state),
    ]);
    await writeFile(join(directory, "state.zip"), archive);
    await writeFile(
      join(directory, "gh"),
      `#!${process.execPath}
const { appendFileSync, readFileSync } = require("node:fs");
const args = process.argv.slice(2);
const path = args.find((value) => value.startsWith("repos/"));
const method = args.includes("--method") ? args[args.indexOf("--method") + 1] : "GET";
appendFileSync("calls.jsonl", JSON.stringify({ path, method }) + "\\n");
if (process.env.FAIL_PATH && path.includes(process.env.FAIL_PATH)) process.exit(1);
if (process.env.BAD_GITHUB_JSON) { process.stdout.write("{"); process.exit(0); }
const content = (value) => ({ content: Buffer.from(JSON.stringify(value)).toString("base64") });
let result;
if (path.includes("contents/config/app-cd.json")) result = content({ reader: {
  repository: "mdbase-dev/mdbase-reader", store_workflow: "publish-reader-extension.yml",
  store_targets: ["extension-chrome"], ci: "ci.yml",
} });
else if (path.includes("contents/config/client-apps.json")) result = content([
  { repository: "mdbase-dev/mdbase-reader", store_checks: { "extension-chrome": [{ workflow: "ci.yml" }] } },
]);
else if (path.endsWith("tasknotes-store-line.yml/dispatches")) {
  const request = JSON.parse(readFileSync(0, "utf8"));
  if (request.inputs.operation !== "status") process.exit(2);
  result = { workflow_run_id: 71 };
}
else if (path.endsWith("actions/runs/71")) result = {
  id: 71, path: ".github/workflows/tasknotes-store-line.yml", head_branch: "main",
  event: "workflow_dispatch", run_attempt: 1, repository: { full_name: "mdbase-dev/mdbase-cloud-ops" },
  status: "completed", conclusion: "success",
};
else if (path.includes("actions/runs/71/artifacts")) result = {
  artifacts: [{ id: 81, name: "tasknotes-store-line", expired: false }],
};
else if (path.endsWith("artifacts/81/zip")) {
  process.stdout.write(readFileSync("state.zip")); process.exit(0);
}
else if (path.includes("/compare/")) result = { status: "identical" };
else if (path.includes("workflows/ci.yml/runs")) result = { workflow_runs: process.env.NO_CI ? [] : [{
  id: 3, head_sha: process.env.SOURCE_SHA, event: "push", head_branch: "main",
  path: ".github/workflows/ci.yml", status: "completed", conclusion: "success",
}] };
else if (path.includes("workflows/publish-reader-extension.yml/runs")) result = [{ workflow_runs:
  process.env.BAD_PREVIOUS ? [{ id: 8, status: "completed", run_attempt: 1,
    path: ".github/workflows/publish-reader-extension.yml", event: "workflow_dispatch", head_branch: "main" }] : [],
}];
else if (path.includes("actions/runs/8/artifacts")) result = {
  artifacts: [{ id: 82, name: "reader-store-extension-chrome-8", expired: false }],
};
else if (path.endsWith("artifacts/82/zip")) {
  process.stdout.write(readFileSync("state.zip")); process.exit(0);
}
else if (path.includes("git/matching-refs/")) result = [[]];
else if (path.includes("contents/apps/extension/package.json")) result = process.env.BAD_CONTENT ? { content: "e30=".slice(0, 2) } : content({ version: "0.5.0" });
else process.exit(3);
process.stdout.write(JSON.stringify(result));
`,
      { mode: 0o755 },
    );
    await writeFile(
      join(directory, "fetch.mjs"),
      `globalThis.fetch = async () => {
  if (process.env.FAIL_FETCH) throw new Error("test-only-token private transport diagnostics");
  return { ok: true, json: async () => JSON.parse(process.env.TEST_STATUS) };
};
`,
    );
    const receipt = join(directory, "store-cd-result.json");
    const invoke = (command, extra = {}) =>
      spawnSync(process.execPath, ["--import", join(directory, "fetch.mjs"), script, command], {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          ...env,
          PATH: `${directory}:${process.env.PATH}`,
          STORE_RECEIPT: receipt,
          GITHUB_OUTPUT: join(directory, "output"),
          TEST_STATUS: JSON.stringify({
            itemId,
            publishedItemRevisionStatus: { distributionChannels: [{ crxVersion: "0.5.0" }] },
          }),
          ...options,
          ...extra,
        },
      });
    await run({ invoke, receipt, directory });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("prepare observer failures retain allowlisted pre-write receipts through finish", async () => {
  for (const options of [
    { FAIL_FETCH: "1" },
    { TEST_STATUS: "{" },
    { FAIL_PATH: "contents/config/app-cd.json" },
    { BAD_GITHUB_JSON: "1" },
    { BAD_CONTENT: "1" },
    { FAIL_PATH: "workflows/publish-reader-extension.yml/runs" },
    { BAD_PREVIOUS: "1" },
    { FAIL_PATH: "git/matching-refs/" },
    { FAIL_PATH: "contents/apps/extension/package.json" },
  ]) {
    await fixture(async ({ invoke, receipt, directory }) => {
      const result = invoke("prepare");
      assert.equal(result.status, 1);
      assert.ok(!result.stderr.includes("test-only-token"));
      const saved = JSON.parse(await readFile(receipt, "utf8"));
      assert.deepEqual(saved, {
        schema: "reader/store-cd/1",
        target: "extension-chrome",
        source,
        run_id: 7,
        write_started: false,
        outcome: "stopped",
        reason:
          options.FAIL_FETCH || options.TEST_STATUS
            ? "store-observer-unavailable"
            : "release-evidence-unavailable",
      });
      assert.equal(
        invoke("finish", {
          PREPARE_RESULT: "failure",
          BUILD_RESULT: "skipped",
          PUBLISH_RESULT: "skipped",
        }).status,
        0,
      );
      assert.deepEqual(JSON.parse(await readFile(receipt, "utf8")), saved);
      const calls = (await readFile(join(directory, "calls.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map(JSON.parse);
      assert.ok(
        calls.every(
          ({ method, path }) =>
            method === "GET" ||
            (method === "POST" && path.endsWith("tasknotes-store-line.yml/dispatches")),
        ),
      );
    }, options);
  }
});

test("prepare preserves policy refusals, qualification deferrals and queue outcomes", async () => {
  for (const [status, reason] of [
    [{ itemId }, "existing-store-listing-required"],
    [{ itemId: "b".repeat(32) }, "store-item-binding-required"],
    [{ itemId, warned: true }, "store-policy-issue"],
    [{ itemId, submittedItemRevisionStatus: { state: "REJECTED" } }, "store-rejected"],
    [{ itemId, submittedItemRevisionStatus: { state: "PENDING_REVIEW" } }, null],
  ]) {
    await fixture(
      async ({ invoke, receipt }) => {
        assert.equal(invoke("prepare").status, reason ? 1 : 0);
        const saved = JSON.parse(await readFile(receipt, "utf8"));
        assert.equal(saved.write_started, false);
        assert.equal(saved.outcome, reason ? "stopped" : "pending-review");
        assert.equal(saved.reason, reason ?? undefined);
      },
      { TEST_STATUS: JSON.stringify(status) },
    );
  }
  await fixture(
    async ({ invoke, receipt }) => {
      assert.equal(invoke("prepare").status, 0);
      assert.equal(JSON.parse(await readFile(receipt, "utf8")).reason, "exact-main-ci-required");
    },
    { NO_CI: "1" },
  );
});

test("finish still stops failed build or publication without resetting started writes", async () => {
  for (const failed of ["BUILD_RESULT", "PUBLISH_RESULT"]) {
    await fixture(async ({ invoke, receipt }) => {
      await writeFile(receipt, JSON.stringify({ write_started: true, outcome: "uploading" }));
      assert.equal(invoke("finish", { [failed]: "failure" }).status, 0);
      const saved = JSON.parse(await readFile(receipt, "utf8"));
      assert.equal(saved.outcome, "stopped");
      assert.equal(saved.reason, "app-publication-failed");
      assert.equal(saved.write_started, true);
    });
  }
});
