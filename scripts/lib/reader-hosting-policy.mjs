// Reviewed Reader policy only: no Writer R2/compiler-runtime policy transfer.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { readerDeployments } from "../../apps/reader/scripts/deployment-environment.mjs";
export const digest = (b) => createHash("sha256").update(b).digest("hex");
const check = (ok, reason) => {
  if (!ok) throw Error("Reader hosting refusal: " + reason);
};
export const compatibilityDate = "2026-10-20";
export async function sourceHostingPolicy(root) {
  const controls = {};
  for (const path of ["_routes.json", "_redirects"]) {
    const bytes = await readFile(join(root, "apps/reader/public", path));
    controls[path] = { path, bytes: bytes.length, sha256: digest(bytes) };
  }
  const routes = JSON.parse(await readFile(join(root, "apps/reader/public/_routes.json"), "utf8"));
  check(
    isDeepStrictEqual(routes, { version: 1, include: ["/api/*"], exclude: [] }),
    "source capture route scope",
  );
  const redirects = (await readFile(join(root, "apps/reader/public/_redirects"), "utf8"))
    .split("\n")
    .filter((l) => l && !l.startsWith("#"));
  const paths = [
    "/import",
    "/import/",
    "/import/zotero",
    "/import/zotero/",
    "/import/readwise",
    "/import/readwise/",
  ];
  check(
    isDeepStrictEqual(
      redirects,
      paths.map((p) => `${p} / 200`),
    ),
    "source client route scope",
  );
  const policy = {
    project: "mdbase-reader",
    compatibility_date: compatibilityDate,
    compatibility_flags: [],
    controls,
    clientRoutes: paths,
    captureHeaders: {
      "cache-control": "no-store",
      "content-type": "application/json",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
    },
  };
  return { ...policy, sourcePolicySha256: digest(JSON.stringify(policy)) };
}
export function uploadConfiguration(policy) {
  const settings = { compatibility_date: policy.compatibility_date, compatibility_flags: [] };
  return {
    name: policy.project,
    pages_build_output_dir: "./artifact/publish",
    ...settings,
    env: { preview: { ...settings }, production: { ...settings } },
  };
}
export function coveredHostingControls(policy, inventory) {
  for (const item of inventory) {
    const parts = item.path.split("/");
    const special = parts.some((p) => p.startsWith("_") || p.startsWith("."));
    if (!special) continue;
    // .nojekyll IS a served file, not an omitted control. SDK-generated asset
    // directories with ordinary names and .well-known metadata remain byte GETs.
    check(
      item.path === ".nojekyll" ||
        (item.path.startsWith(".well-known/") &&
          !parts.some((p) =>
            ["_headers", "_redirects", "_routes.json", "_worker.js"].includes(p),
          )) ||
        (item.path.startsWith("assets/") &&
          /\.(?:m?js|css|map|wasm|woff2?|ttf|png|svg|json)$/.test(item.path) &&
          !parts.some((p) =>
            ["_headers", "_redirects", "_routes.json", "_worker.js"].includes(p),
          )) ||
        ["_routes.json", "_redirects", "_worker.js"].includes(item.path) ||
        item.path.startsWith("_worker.js/"),
      "unknown hosting control requires reviewed source policy",
    );
  }
  const covered = [];
  for (const [path, original] of Object.entries(policy.controls)) {
    const item = inventory.find((a) => a.path === path);
    check(
      item && item.sha256 === original.sha256 && item.bytes === original.bytes,
      "source control changed",
    );
    covered.push({
      ...item,
      evidence:
        "source policy + immutable upload + scoped deployment metadata + bounded behavior probes",
    });
  }
  const workers = inventory.filter(
    (a) => a.path === "_worker.js" || a.path.startsWith("_worker.js/"),
  );
  const entry = workers.find((a) => a.path === "_worker.js" || a.path === "_worker.js/index.js");
  check(entry?.bytes > 0, "missing precompiled capture Worker");
  covered.push(
    ...workers.map((worker) => ({
      ...worker,
      evidence:
        "source/run-bound precompiled Worker + scoped deployment metadata + capture denial probes; NOT Worker-source GET",
    })),
  );
  return covered;
}
export function safeProject(project, environment) {
  check(
    project?.name === "mdbase-reader" &&
      /^[A-Za-z0-9-]{1,128}$/.test(project.id ?? "") &&
      project.production_branch === "main",
    "project identity",
  );
  const config = project.deployment_configs?.[environment];
  check(config && typeof config === "object", "target configuration unavailable");
  for (const key of [
    "r2_buckets",
    "d1_databases",
    "kv_namespaces",
    "durable_object_namespaces",
    "services",
    "queue_producers",
    "hyperdrive_bindings",
    "vectorize_bindings",
    "ai_bindings",
  ])
    check(!config[key] || Object.keys(config[key]).length === 0, "unexpected runtime binding");
  check(
    config.compatibility_date == null || /^\d{4}-\d{2}-\d{2}$/.test(config.compatibility_date),
    "safe date",
  );
  check(
    Array.isArray(config.compatibility_flags ?? []) &&
      (config.compatibility_flags ?? []).every((f) => /^[a-z0-9_]+$/.test(f)),
    "safe flags",
  );
  return {
    project: { id: project.id, name: project.name, production_branch: project.production_branch },
    configuration: {
      compatibility_date: config.compatibility_date ?? null,
      compatibility_flags: config.compatibility_flags ?? [],
    },
  };
}
export function assertHostingMetadata(policy, metadata, plan, deployment, preflight) {
  const target = readerDeployments[plan.sdkTrust?.environment];
  check(
    ["staging", "production"].includes(plan.sdkTrust?.environment) &&
      target &&
      plan.origin === target.origin &&
      plan.pagesBranch === target.branch,
    "target/channel",
  );
  check(
    metadata.project?.name === policy.project &&
      metadata.project.production_branch === "main" &&
      /^[A-Za-z0-9-]{1,128}$/.test(metadata.project.id ?? ""),
    "project",
  );
  check(!preflight || preflight.project.id === metadata.project.id, "project changed");
  check(
    metadata.configuration?.compatibility_date === policy.compatibility_date &&
      isDeepStrictEqual(metadata.configuration.compatibility_flags, []),
    "runtime configuration",
  );
  const d = metadata.deployment;
  check(
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(deployment?.id ?? "") &&
      d?.id === deployment.id &&
      d.url === deployment.url &&
      d.sourceSha === plan.sha &&
      deployment.sourceSha === plan.sha &&
      d.pagesBranch === plan.pagesBranch &&
      deployment.pagesBranch === plan.pagesBranch &&
      d.environment === (plan.sdkTrust.environment === "production" ? "production" : "preview") &&
      d.status === "success",
    "actual successful deployment/source/channel",
  );
}
export async function readHostingMetadata({
  policy,
  plan,
  deployment,
  preflight,
  accountId,
  apiToken,
  transport = fetch,
}) {
  check(accountId && apiToken, "credentials unavailable");
  check(["staging", "production"].includes(plan.sdkTrust?.environment), "target");
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/mdbase-reader`;
  const get = async (path) => {
    const response = await transport(base + path, {
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    check(response.ok, "metadata HTTP status");
    const body = await response.json();
    check(body.success === true && body.result, "metadata result");
    return body.result;
  };
  const safe = safeProject(
    await get(""),
    plan.sdkTrust.environment === "production" ? "production" : "preview",
  );
  if (!deployment) return safe;
  check(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(deployment.id ?? ""), "UUID");
  const d = await get("/deployments/" + deployment.id),
    m = d.deployment_trigger?.metadata;
  const result = {
    ...safe,
    deployment: {
      id: d.id === deployment.id ? d.id : null,
      url: /^https:\/\/[0-9a-f]{8,32}\.mdbase-reader\.pages\.dev$/.test(d.url ?? "") ? d.url : null,
      sourceSha: /^[0-9a-f]{40}$/.test(m?.commit_hash ?? "") ? m.commit_hash : null,
      pagesBranch: ["main", "staging"].includes(m?.branch) ? m.branch : null,
      environment: ["preview", "production"].includes(d.environment) ? d.environment : null,
      status: d.latest_stage?.status === "success" ? "success" : null,
    },
  };
  try {
    assertHostingMetadata(policy, result, plan, deployment, preflight);
  } catch (error) {
    error.safeEvidence = result;
    throw error;
  }
  return result;
}
