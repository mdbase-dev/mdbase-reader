// Byte proof is distinct from executing Worker policy and app admission.
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyServedBytes, assertInventory } from "../../../scripts/lib/native-publish-bytes.mjs";
import {
  sourceHostingPolicy,
  assertHostingMetadata,
  coveredHostingControls,
  digest,
} from "../../../scripts/lib/reader-hosting-policy.mjs";
import { assertInventoryCoverage } from "./native-publisher.mjs";
import { assertOfflineShell } from "../../../scripts/lib/reader-offline-shell.mjs";
export const isFetchableAsset = (path) =>
  !["_routes.json", "_headers", "_redirects"].includes(path.split("/").at(-1)) &&
  path !== "_worker.js" &&
  !path.startsWith("_worker.js/");
async function probe(transport, url, status, expected, remaining) {
  if (remaining <= 0) throw Error("publication-timeout");
  const controller = new AbortController();
  let timer, reader, response;
  try {
    return await Promise.race([
      (async () => {
        response = await transport(url, {
          method: "GET",
          redirect: "manual",
          credentials: "omit",
          cache: "no-store",
          headers: { "Accept-Encoding": "identity" },
          signal: controller.signal,
        });
        if (
          response.redirected ||
          (response.url && response.url !== url) ||
          response.status !== status
        )
          throw Error("policy route/status/redirect");
        for (const [name, value] of Object.entries(expected.headers ?? {}))
          if (response.headers?.get(name) !== value) throw Error("source response header policy");
        reader = response.body?.getReader();
        if (!reader) throw Error("policy missing body");
        const chunks = [];
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!(value instanceof Uint8Array)) throw Error("policy nonbyte body");
          size += value.length;
          if (size > expected.bytes) throw Error("policy body limit");
          chunks.push(value);
        }
        if (size !== expected.bytes || digest(Buffer.concat(chunks)) !== expected.sha256)
          throw Error("policy route bytes");
        return {
          url,
          status,
          bytes: size,
          sha256: expected.sha256,
          ...(expected.headers ? { headers: expected.headers } : {}),
        };
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => {
            controller.abort();
            reject(Error("policy timeout"));
          },
          Math.min(10000, remaining),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
    try {
      Promise.resolve(reader ? reader.cancel() : response?.body?.cancel()).catch(() => {});
    } catch {
      /* Best-effort bounded cancellation; never log response contents. */
    }
  }
}
export async function verifyServedAssets({ origin, inventory, publication, ...options }) {
  if (!["https://staging.mdbase-reader.pages.dev", "https://reader.mdbase.dev"].includes(origin))
    throw Error("Non-target Reader origin");
  assertInventoryCoverage(inventory);
  const total = options.totalTimeoutMs ?? 180000;
  if (!Number.isSafeInteger(total) || total < 1 || total > 180000)
    throw Error("Invalid publication budget");
  const deadline = performance.now() + total,
    left = () => Math.max(0, Math.floor(deadline - performance.now()));
  let coveredControls = [],
    policy = null,
    metadata = null,
    offlineShell = null;
  const policyFailures = [],
    behavior = [];
  try {
    if (!publication) throw Error("missing source/deployment evidence");
    const { repoRoot, artifactRoot, plan, deployment, metadata: host, preflight } = publication;
    if (plan.origin !== origin) throw Error("target origin");
    await assertInventory(join(artifactRoot, "publish"), inventory);
    policy = await sourceHostingPolicy(repoRoot);
    assertHostingMetadata(policy, host, plan, deployment, preflight);
    coveredControls = coveredHostingControls(policy, inventory);
    offlineShell = await assertOfflineShell(
      join(artifactRoot, "publish"),
      inventory,
      plan.sdkTrust.offlineShell,
    );
    metadata = host;
  } catch {
    policyFailures.push({ reason: "source-upload-deployment-policy-refused" });
  }
  const staticInventory = inventory.filter((a) => isFetchableAsset(a.path));
  const remaining = left();
  const result =
    remaining > 0
      ? await verifyServedBytes(origin, staticInventory, {
          ...options,
          totalTimeoutMs: remaining,
        })
      : {
          verified: [],
          unverified: [],
          failures: staticInventory.map((a) => ({
            path: a.path,
            reason: "publication-timeout",
            attempts: 0,
          })),
        };
  const unhandled = inventory.filter(
    (a) => !isFetchableAsset(a.path) && !coveredControls.some((c) => c.path === a.path),
  );
  result.unverified.push(
    ...unhandled.map((a) => ({ ...a, reason: "unknown-or-unverified-control" })),
  );
  if (policy && metadata && !policyFailures.length) {
    try {
      const root = inventory.find((a) => a.path === "index.html"),
        notFound = inventory.find((a) => a.path === "404.html");
      if (!root || !notFound) throw Error("missing route expected bytes");
      const transport = options.fetch ?? fetch;
      for (const path of policy.clientRoutes)
        behavior.push(await probe(transport, origin + path, 200, root, left()));
      const denied = Buffer.from(
        JSON.stringify({ code: "method_not_allowed", message: "Use POST to capture a page." }),
      );
      behavior.push(
        await probe(
          transport,
          origin + "/api/capture",
          405,
          { bytes: denied.length, sha256: digest(denied), headers: policy.captureHeaders },
          left(),
        ),
      );
      for (const path of ["/api/native-publisher-not-found", "/native-publisher-not-found"])
        behavior.push(await probe(transport, origin + path, 404, notFound, left()));
    } catch {
      policyFailures.push({ reason: "bounded-source-route-behavior-refused" });
    }
  }
  // .nojekyll is in result.verified via actual byte GET, never covered/omitted.
  const seen = [...result.verified, ...coveredControls];
  result.policyFailures = policyFailures;
  result.policyEvidence =
    policy && metadata
      ? {
          sourcePolicySha256: policy.sourcePolicySha256,
          offlineShell,
          deployment: metadata.deployment,
          coveredControls,
          behavior,
        }
      : null;
  result.ok =
    left() > 0 &&
    !result.failures.length &&
    !result.unverified.length &&
    !policyFailures.length &&
    behavior.length === 9 &&
    seen.length === inventory.length &&
    new Set(seen.map((a) => a.path)).size === inventory.length &&
    inventory.every((a) =>
      seen.some((b) => b.path === a.path && b.bytes === a.bytes && b.sha256 === a.sha256),
    );
  return result;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .reduce((a, v, i, all) => (i % 2 === 0 ? [...a, [v.slice(2), all[i + 1]]] : a), []),
  );
  const json = async (p) => JSON.parse(await readFile(p, "utf8"));
  try {
    const result = await verifyServedAssets({
      origin: args.origin,
      inventory: await json(args.inventory),
      publication: {
        repoRoot: resolve("."),
        artifactRoot: args.artifact,
        plan: await json(args.plan),
        deployment: await json(args.deployment),
        metadata: await json(args.metadata),
        preflight: await json(args.preflight),
      },
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.log(
      JSON.stringify({
        ok: false,
        failures: [{ reason: "verification-input-refused" }],
        unverified: [],
      }),
    );
    process.exitCode = 1;
  }
}
