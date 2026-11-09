import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
export const repository = "mdbase-dev/mdbase-reader";
export const ops = "mdbase-dev/mdbase-cloud-ops";
export const workflow = "publish-reader-extension.yml";
export const target = "extension-chrome";
export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const need = (condition, reason) => {
  if (!condition) throw Object.assign(new Error(reason), { reason });
};
export const json = async (path) => JSON.parse(await readFile(path, "utf8"));
export function gh(path, { method, body, pages = false, raw = false } = {}) {
  const args = ["api", ...(pages ? ["--paginate", "--slurp"] : []), path];
  if (method) args.push("--method", method, "--input", "-");
  const token =
    path.startsWith(`repos/${ops}/`) || path.startsWith("repos/mdbase-dev/mdbase-connect/")
      ? process.env.APP_EVIDENCE_GH_TOKEN
      : method
        ? process.env.READER_RELEASE_TOKEN
        : process.env.GITHUB_TOKEN;
  const bytes = execFileSync("gh", args, {
    input: body ? JSON.stringify(body) : undefined,
    env: { ...process.env, GH_TOKEN: token },
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 100 * 1024 * 1024,
  });
  return raw ? bytes : JSON.parse(bytes);
}
export function versionParts(version) {
  need(/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){2,3}$/.test(version ?? ""), "numeric-store-version-required");
  const parts = version.split(".").map(Number);
  need(
    parts.every((part) => part <= 65535) && parts.some(Boolean),
    "chrome-version-range-required",
  );
  return [...parts, ...Array(4 - parts.length).fill(0)];
}
export function compareVersions(left, right) {
  const previous = versionParts(right);
  return versionParts(left).reduce(
    (comparison, part, index) => comparison || part - previous[index],
    0,
  );
}
export function nextVersion(manifest, used) {
  versionParts(manifest);
  const highest = used.reduce(
    (highest, version) => (compareVersions(version, highest) > 0 ? version : highest),
    manifest,
  );
  if (!used.some((version) => compareVersions(version, manifest) >= 0)) return manifest;
  const parts = versionParts(highest);
  const index = parts[3] ? 3 : 2;
  need(parts[index] < 65535, "chrome-version-exhausted");
  parts[index] += 1;
  return parts.slice(0, parts[3] ? 4 : 3).join(".");
}
export function reviewBlock(status, itemId) {
  need(status.itemId === itemId, "store-item-binding-required");
  need(!status.warned && !status.takenDown, "store-policy-issue");
  const state = status.submittedItemRevisionStatus?.state;
  need(!["REJECTED", "CANCELLED"].includes(state), "store-rejected");
  if (["PENDING_REVIEW", "STAGED"].includes(state) || status.lastAsyncUploadState === "IN_PROGRESS")
    return "pending-review";
  need(!state || ["PUBLISHED", "PUBLISHED_TO_TESTERS"].includes(state), "store-state-unknown");
  need(status.lastAsyncUploadState !== "FAILED", "store-upload-failed");
  return null;
}
export function context(env = process.env) {
  need(
    env.GITHUB_REPOSITORY === repository &&
      env.GITHUB_REF === "refs/heads/main" &&
      env.GITHUB_RUN_ATTEMPT === "1" &&
      env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
      env.GITHUB_WORKFLOW_REF === `${repository}/.github/workflows/${workflow}@refs/heads/main` &&
      env.STORE_TARGET === target &&
      /^[a-f0-9]{40}$/.test(env.SOURCE_SHA ?? ""),
    "protected-store-context-required",
  );
}
export function artifactJson(bytes, filename) {
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        "import sys,io,zipfile; archive=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); entry=archive.getinfo(sys.argv[1]); assert entry.file_size<65536; sys.stdout.buffer.write(archive.read(entry))",
        filename,
      ],
      { input: bytes },
    ),
  );
}
export async function storeLine(
  transport = gh,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  const response = transport(`repos/${ops}/actions/workflows/tasknotes-store-line.yml/dispatches`, {
    method: "POST",
    body: {
      ref: "main",
      inputs: { app: "reader", store: target, operation: "status", reason: "app-outcome-unknown" },
      return_run_details: true,
    },
  });
  const runId = response.workflow_run_id;
  need(Number.isSafeInteger(runId) && runId > 0, "store-line-dispatch-unknown");
  for (let attempt = 0; attempt < 90; attempt++) {
    const run = transport(`repos/${ops}/actions/runs/${runId}`);
    need(
      run.id === runId &&
        run.path === ".github/workflows/tasknotes-store-line.yml" &&
        run.head_branch === "main" &&
        run.event === "workflow_dispatch" &&
        run.run_attempt === 1 &&
        run.repository?.full_name === ops,
      "store-line-run-binding-required",
    );
    if (run.status === "completed") {
      need(run.conclusion === "success", "store-line-read-failed");
      const artifacts = transport(
        `repos/${ops}/actions/runs/${runId}/artifacts?per_page=100`,
      ).artifacts.filter(
        (artifact) => artifact.name === "tasknotes-store-line" && !artifact.expired,
      );
      need(artifacts.length === 1, "store-line-artifact-required");
      return artifactJson(
        transport(`repos/${ops}/actions/artifacts/${artifacts[0].id}/zip`, { raw: true }),
        "store-line.json",
      );
    }
    await wait(2000);
  }
  throw new Error("store-line-read-timeout");
}
export async function qualify(source, transport = gh, readState = storeLine) {
  const file = transport(`repos/${ops}/contents/config/app-cd.json?ref=main`);
  const cfg = JSON.parse(Buffer.from(file.content, "base64")).reader;
  need(
    cfg.repository === repository &&
      cfg.store_workflow === workflow &&
      cfg.store_targets.includes(target),
    "store-enrollment-required",
  );
  const clients = transport(`repos/${ops}/contents/config/client-apps.json?ref=main`);
  const checks = JSON.parse(Buffer.from(clients.content, "base64")).find(
    (client) => client.repository === repository,
  )?.store_checks?.[target];
  need(Array.isArray(checks) && checks.length > 0, "store-check-policy-required");
  need(
    checks.some((check) => check.workflow === cfg.ci) &&
      new Set(checks.map((check) => check.workflow)).size === checks.length,
    "store-check-policy-required",
  );
  const state = await readState(transport);
  need(
    state.app === "reader-extension-chrome" &&
      typeof state.stopped === "boolean" &&
      typeof state.app_stopped === "boolean",
    "store-line-binding-required",
  );
  if (state.stopped || state.app_stopped) return "app-line-stopped";
  const comparison = transport(`repos/${repository}/compare/${source}...main?per_page=1`);
  need(["identical", "ahead"].includes(comparison.status), "source-main-ancestry-required");
  for (const check of checks) {
    need(
      /^[A-Za-z0-9_-]+\.yml$/.test(check.workflow) &&
        (!check.jobs ||
          (Array.isArray(check.jobs) &&
            check.jobs.length > 0 &&
            check.jobs.every((name) => typeof name === "string" && name.length > 0) &&
            new Set(check.jobs).size === check.jobs.length)),
      "store-check-policy-required",
    );
    const runs = transport(
      `repos/${repository}/actions/workflows/${check.workflow}/runs?head_sha=${source}&branch=main&event=push&per_page=100`,
    )
      .workflow_runs.filter(
        (run) =>
          run.head_sha === source &&
          run.event === "push" &&
          run.head_branch === "main" &&
          run.path === `.github/workflows/${check.workflow}`,
      )
      .sort((left, right) => right.id - left.id || right.run_attempt - left.run_attempt);
    const run = runs[0];
    if (!run || run.status !== "completed" || run.conclusion !== "success")
      return "no-qualified-source";
    if (!check.jobs) continue;
    const jobs = transport(
      `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
      { pages: true },
    ).flatMap((page) => page.jobs);
    if (
      !check.jobs.every(
        (name) =>
          jobs.filter((job) => job.name === name).length === 1 &&
          jobs.some(
            (job) =>
              job.name === name &&
              job.run_id === run.id &&
              job.run_attempt === run.run_attempt &&
              job.conclusion === "success" &&
              job.status === "completed",
          ),
      )
    )
      return "no-qualified-source";
  }
  return null;
}
