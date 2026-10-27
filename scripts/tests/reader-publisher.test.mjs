import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { intakeCopy } from "./helpers/reader-intake.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  extensionEnvironment,
  extensionMdbaseManifest,
} from "../../apps/extension/scripts/extension-manifest.mjs";
import {
  assertDispatch,
  assertFullSha,
  assertExactCleanCheckout,
  createReceipt,
  captureDeployment,
  assertInventoryCoverage,
  assertBuiltTarget,
} from "../../apps/reader/scripts/native-publisher.mjs";
import { verifyServedAssets } from "../../apps/reader/scripts/verify-served.mjs";
import {
  sourceHostingPolicy,
  coveredHostingControls,
  safeProject,
  digest,
  uploadConfiguration,
} from "../lib/reader-hosting-policy.mjs";
import { assertArtifactMetadata, download } from "../lib/native-artifact.mjs";
import { assertCurrentHead } from "../native-current-head.mjs";
import {
  loadOriginals,
  originalMembers,
  assertInstalledOriginals,
} from "../lib/native-originals.mjs";
import { approvedHashes } from "../lib/reader-approved-intake.mjs";
import { inventoryDirectory } from "../lib/native-publish-bytes.mjs";
import { offlineFixture } from "./reader-offline-fixture.mjs";
const source = "a".repeat(40),
  tree = "b".repeat(40),
  id = "12345678-1234-1234-1234-123456789abc",
  origin = "https://staging.mdbase-reader.pages.dev";
const dispatch = {
  target: "staging",
  sha: source,
  eventName: "workflow_dispatch",
  ref: "refs/heads/release/native-staging",
  workflowSha: source,
};
test("full dispatch/event/SHA/target/ref are independent exact gates", () => {
  assert.doesNotThrow(() => assertDispatch(dispatch));
  for (const patch of [
    { target: "lab" },
    { target: "production" },
    { sha: "a".repeat(39) },
    { sha: source.toUpperCase() },
    { eventName: "pull_request" },
    { ref: "refs/heads/main" },
    { ref: "refs/tags/release/native-staging" },
    { workflowSha: "c".repeat(40) },
  ])
    assert.throws(() => assertDispatch({ ...dispatch, ...patch }));
  assert.throws(() => assertFullSha("main"));
});
test("last current HEAD rejects moved branch even if source remains ancestor", async () => {
  const env = {
    SOURCE_SHA: source,
    TARGET: "staging",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: dispatch.ref,
    GITHUB_SHA: source,
    GITHUB_REPOSITORY: "owner/reader",
  };
  await assertCurrentHead(env, async () =>
    Response.json({ ref: dispatch.ref, object: { type: "commit", sha: source } }),
  );
  for (const value of [
    { ref: dispatch.ref, object: { type: "commit", sha: "c".repeat(40) } },
    { ref: "refs/heads/main", object: { type: "commit", sha: source } },
    { ref: dispatch.ref, object: { type: "tag", sha: source } },
  ])
    await assert.rejects(assertCurrentHead(env, async () => Response.json(value)));
});
test("ALL installed SDK, multilingual UI candidate, protocol and peers match their archives (not native approval)", async () => {
  const repoRoot = process.cwd();
  const installerEvidence = [];
  const sdkMembers = originalMembers("packages/connect/vendor/sdk-dce61ff5-production-beta141.tgz");
  const uiArchive = "vendor/mdbase-dev-ui-0.1.0-beta.141-24e9f5d0.tgz";
  assert.equal(
    createHash("sha256")
      .update(await readFile(uiArchive))
      .digest("hex"),
    "1230707f2ba9545a041f2a9325ab5e2d25ed001885ebc0369d836e00b19d30f0",
  );
  const uiMembers = originalMembers(uiArchive);
  const protocolMembers = originalMembers(
    "packages/connect/vendor/mdbase-dev-connect-protocol-0.1.0-beta.129-c280cd194ffd.tgz",
  );
  const sdkRoot = await realpath("apps/reader/node_modules/@mdbase-dev/sdk");
  const options = { repoRoot, packageManager: "pnpm@10.7.0", installerEvidence };
  for (const owner of ["apps/reader", "packages/connect"]) {
    await assertInstalledOriginals(
      await realpath(`${owner}/node_modules/@mdbase-dev/sdk`),
      sdkMembers,
      "installed SDK differs",
      { ...options, sdk: true },
    );
  }
  for (const owner of [
    "apps/reader",
    "apps/extension",
    "packages/ui",
    "packages/markdown-editor",
  ]) {
    const uiRoot = await realpath(`${owner}/node_modules/@mdbase-dev/ui`);
    // pnpm links the i18n peer's CLI into this candidate package. Like the
    // separately classified YAML wrapper, this single tooling file is not an
    // archive original or native-approval evidence. No blanket .bin exclusion.
    const shimPath = "node_modules/.bin/mdbase-i18n";
    const shim = await readFile(join(uiRoot, shimPath));
    const installedUiMembers = [
      ...uiMembers,
      {
        path: shimPath,
        bytes: shim.length,
        sha256: createHash("sha256").update(shim).digest("hex"),
      },
    ].sort((a, b) => (a.path < b.path ? -1 : 1));
    await assertInstalledOriginals(uiRoot, installedUiMembers, "installed UI candidate differs");
    await assertInstalledOriginals(
      await realpath(join(uiRoot, "../sdk")),
      sdkMembers,
      "UI SDK peer differs",
      { ...options, sdk: true },
    );
  }
  await assertInstalledOriginals(
    await realpath("node_modules/@mdbase-dev/connect-protocol"),
    protocolMembers,
    "installed protocol differs",
    { ...options, protocol: true, originalSdkRoot: sdkRoot, originalSdkMembers: sdkMembers },
  );
  assert.equal(sdkMembers.length, 896);
  assert.equal(uiMembers.length, 94);
  assert.equal(protocolMembers.length, 67);
  assert.ok(installerEvidence.some((r) => r.package === "protocol"));
  assert.ok(installerEvidence.length > 0);
  for (const r of installerEvidence) {
    assert.equal(r.originalSdkMembers, 896);
    assert.equal(r.originalPackageMembers, r.package === "sdk" ? 896 : 67);
    assert.equal(r.totalInstalledFiles, r.originalPackageMembers + 1);
    assert.equal(r.originalYamlMembers, 233);
    assert.equal(r.manager, "pnpm@10.7.0");
    assert.equal(r.path, "node_modules/.bin/yaml");
  }
  console.log(
    "Installed archive comparison including multilingual UI candidate (NOT native admission)",
    JSON.stringify(installerEvidence),
  );
});
test("native publisher scopes public staging key to target build, not default-LAB manifest checks", async () => {
  const workflow = parseYaml(await readFile(".github/workflows/deploy-reader.yml", "utf8"));
  const job = workflow.jobs["native-build"];
  // The shared form is already wired; native builds must retain its public configuration.
  assert.equal(
    job.env.VITE_MDBASE_FEEDBACK_URL,
    "${{ inputs.target == 'production' && 'https://feedback-api.mdbase.dev/v1/feedback' || 'https://feedback-api-staging.mdbase.dev/v1/feedback' }}",
  );
  assert.equal(
    job.env.VITE_MDBASE_FEEDBACK_TURNSTILE_SITE_KEY,
    "${{ inputs.target == 'production' && '0x4AAAAAAEboz_mLT-taI3H-' || '0x4AAAAAAEbkvA4d9vQJq2D1' }}",
  );
  const keyName = "MDBASE_EXTENSION_STAGING_PUBLIC_KEY";
  // Explicit PUBLIC-only presence fixture, NOT an allocated key or GHA identity.
  const publicInput = "public-only-unit-fixture";
  const checkEnvironment = Object.fromEntries(
    ["MDBASE_ENV", "VITE_MDBASE_ENV", keyName]
      .filter((name) => name in job.env)
      .map((name) => [name, name === keyName ? publicInput : job.env[name]]),
  );
  assert.equal(extensionEnvironment(checkEnvironment).target, "lab");
  assert.throws(
    () => extensionEnvironment({ MDBASE_ENV: "lab", [keyName]: publicInput }),
    /staging builds only/,
  );
  const build = job.steps.find((step) => step.id === "build");
  assert.equal(
    build.env[keyName],
    "${{ inputs.target == 'staging' && needs.native-inputs.outputs.public-key || '' }}",
  );
  const hashes = workflow.jobs["native-inputs"].steps.find((step) => step.id === "hashes");
  assert.equal(
    hashes.env[keyName],
    "${{ inputs.target == 'staging' && vars.MDBASE_EXTENSION_STAGING_PUBLIC_KEY || '' }}",
  );
  assert.ok(hashes.run.includes('if [[ "$TARGET" == staging ]]; then'));
});
test("successful checks restore only the known generated extension manifest before strict clean-source guard", async () => {
  const workflow = parseYaml(await readFile(".github/workflows/deploy-reader.yml", "utf8"));
  const commands = workflow.jobs["native-build"].steps
    .find((step) => step.id === "originals")
    .run.split("\n");
  const check = commands.indexOf("pnpm check");
  assert.ok(check >= 0);
  const path = "apps/extension/src/generated/mdbase-app.json";
  const committed = await readFile(path);
  const reader = JSON.parse(await readFile("apps/reader/src/generated/mdbase-app.json", "utf8"));
  const generated = extensionMdbaseManifest(reader, extensionEnvironment({}));
  assert.ok(JSON.parse(committed).installation_origins.production);
  assert.ok(generated.installation_origins.lab);
  // A local disposable DATA repository, not a GitHub build identity/authority.
  const fixture = await mkdtemp(join(tmpdir(), "reader-check-generated-"));
  try {
    await mkdir(join(fixture, path, ".."), { recursive: true });
    await writeFile(join(fixture, path), committed);
    await writeFile(join(fixture, "other-source.txt"), "unchanged source DATA\n");
    execFileSync(
      "bash",
      [
        "-euc",
        "git -c init.defaultBranch=fixture init -q; git add .; git -c core.hooksPath=/dev/null -c commit.gpgsign=false -c user.name=Fixture -c user.email=fixture@example.invalid commit -qm fixture",
      ],
      { cwd: fixture, stdio: ["ignore", "pipe", "pipe"] },
    );
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fixture,
      encoding: "utf8",
    }).trim();
    await writeFile(join(fixture, path), JSON.stringify(generated, null, 2) + "\n");
    assert.throws(
      () => assertExactCleanCheckout({ sha, cwd: fixture }),
      /uncommitted paths: M apps\/extension\/src\/generated\/mdbase-app.json/,
    );
    execFileSync("bash", ["-euc", commands.slice(check + 1).join("\n")], {
      cwd: fixture,
      env: { ...process.env, SOURCE_SHA: sha },
      stdio: ["ignore", "pipe", "pipe"],
    });
    assertExactCleanCheckout({ sha, cwd: fixture });
    assert.deepEqual(await readFile(join(fixture, path)), committed);
    await writeFile(join(fixture, "other-source.txt"), "real source change DATA\n");
    assert.throws(
      () => assertExactCleanCheckout({ sha, cwd: fixture }),
      /uncommitted paths: M other-source.txt/,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
test("historical staging fixture still accepts its original SDK and packet", async () => {
  const root = await intakeCopy();
  try {
    const trust = await loadOriginals({
      target: "staging",
      repoRoot: root,
      hashes: approvedHashes,
    });
    assert.equal(trust.archives.sdk.members, 896);
    assert.equal(trust.nativeAssets["runtime.wasm"].bytes, 3676583);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
for (const [label, path] of Object.entries({
  SDK: "packages/connect/vendor/sdk-dev-eaa4e697-staging.tgz",
  legacy: "vendor/mdbase-dev-sdk-0.0.0-729b5391.tgz",
  UI: "vendor/mdbase-dev-ui-dev-b2d7c464.tgz",
  protocol: "packages/connect/vendor/mdbase-dev-connect-protocol-0.1.0-beta.129-c280cd194ffd.tgz",
  facts:
    "packages/connect/vendor/native-release/staging-eaa4e697/artifact/artifact-facts.public.json",
  provenance: "packages/connect/vendor/native-release/staging-eaa4e697/artifact/provenance.json",
  context:
    "packages/connect/vendor/native-release/staging-eaa4e697/verified-staging/next-trust/staging-context.json",
  rawAsset:
    "packages/connect/vendor/native-release/staging-eaa4e697/verified-staging/next-trust/staging.json",
  receipt: "packages/connect/vendor/native-release/staging-eaa4e697/sdk-build-receipt.json",
  proof:
    "packages/connect/vendor/native-release/staging-eaa4e697/verified-staging/release-trust-bundle.sigstore.json",
  members: "packages/connect/vendor/native-release/staging-eaa4e697/artifact/members.json",
}))
  test(label + " data mutation refuses without executing candidate SDK", async () => {
    const root = await intakeCopy();
    try {
      // Only this test's disposable copy is replaced; custody originals stay 0400.
      await rm(join(root, path));
      await writeFile(join(root, path), "{}");
      await assert.rejects(
        loadOriginals({ target: "staging", repoRoot: root, hashes: approvedHashes }),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
for (const kind of ["old-c0-archive", "old-d313-facts", "invalid-facts-JSON"])
  test("fresh eaa4 independent pins refuse " + kind + " before SDK/JSON execution", async () => {
    const root = await intakeCopy();
    try {
      const archive = "packages/connect/vendor/sdk-dev-eaa4e697-staging.tgz",
        facts =
          "packages/connect/vendor/native-release/staging-eaa4e697/artifact/artifact-facts.public.json";
      const path = kind === "old-c0-archive" ? archive : facts;
      const bytes =
        kind === "old-c0-archive"
          ? await readFile("packages/connect/vendor/sdk-dev-a3023aee-staging.tgz")
          : kind === "old-d313-facts"
            ? await readFile(
                "packages/connect/vendor/native-release/staging/artifact/artifact-facts.public.json",
              )
            : Buffer.from("{invalid");
      await rm(join(root, path));
      await writeFile(join(root, path), bytes);
      await assert.rejects(
        loadOriginals({ target: "staging", repoRoot: root, hashes: approvedHashes }),
        kind === "old-c0-archive"
          ? /sdk protected archive hash mismatch/
          : /approved target facts missing\/mismatched/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
test("safe metadata never exports environment variables or credentials", () => {
  const project = {
    id: "reader-id",
    name: "mdbase-reader",
    production_branch: "main",
    deployment_configs: {
      preview: {
        compatibility_date: "2026-10-20",
        compatibility_flags: [],
        env_vars: { PRIVATE: { value: "must-not-persist" } },
      },
    },
  };
  assert.ok(!JSON.stringify(safeProject(project, "preview")).includes("must-not-persist"));
  assert.throws(() => safeProject({ ...project, production_branch: "other" }, "preview"));
  project.deployment_configs.preview.r2_buckets = { UNAPPROVED: { name: "other" } };
  assert.throws(() => safeProject(project, "preview"));
});
test("Reader upload config has no Writer R2 bindings or workspace paths", async () => {
  const p = await sourceHostingPolicy(process.cwd()),
    cfg = uploadConfiguration(p);
  assert.equal(cfg.name, "mdbase-reader");
  assert.equal(cfg.pages_build_output_dir, "./artifact/publish");
  assert.ok(!JSON.stringify(cfg).includes("r2"));
});
const expected = {
  id: "42",
  digest: "sha256:" + "d".repeat(64),
  target: "staging",
  run: "123",
  attempt: "2",
  source,
  tree,
  repository: "owner/reader",
  repositoryId: "11",
  event: "workflow_dispatch",
};
const meta = {
  id: 42,
  expired: false,
  digest: expected.digest,
  name: "reader-native-build-staging-123-2",
  workflow_run: { id: 123, head_sha: source, head_repository_id: 11 },
};
test("immutable artifact metadata binds every ID/run/attempt/repository/source/digest", () => {
  assertArtifactMetadata(meta, expected);
  for (const patch of [
    { id: 43 },
    { expired: true },
    { digest: "sha256:" + "e".repeat(64) },
    { name: "reader-native-build-staging-123-1" },
    { workflow_run: { ...meta.workflow_run, head_sha: "c".repeat(40) } },
    { workflow_run: { ...meta.workflow_run, head_repository_id: 12 } },
    { workflow_run: { ...meta.workflow_run, id: 124 } },
  ])
    assert.throws(() => assertArtifactMetadata({ ...meta, ...patch }, expected));
});
test("artifact API run event/attempt check occurs before ZIP retrieval", async () => {
  const parent = await mkdtemp(join(tmpdir(), "reader-api-fixture-"));
  let calls = 0;
  try {
    await assert.rejects(
      download(expected, join(parent, "artifact"), async () => {
        calls++;
        return Response.json(
          calls === 1
            ? meta
            : {
                id: 123,
                repository: { full_name: "owner/reader", id: 11 },
                head_sha: source,
                run_attempt: 1,
                event: "workflow_dispatch",
                head_branch: "release/native-staging",
              },
        );
      }),
    );
    assert.equal(calls, 2);
    assert.ok(JSON.parse(await readFile(join(parent, "artifact-metadata.json"))).run);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
test("actual UUID resolves from URL + exact source + Pages channel, never URL-prefix ID", async () => {
  const fetchImpl = async (url) => {
    assert.equal(
      url,
      "https://api.cloudflare.com/client/v4/accounts/fixture/pages/projects/mdbase-reader/deployments?per_page=20",
    );
    return Response.json({
      success: true,
      result: [
        {
          id,
          url: "https://12345678.mdbase-reader.pages.dev",
          deployment_trigger: { metadata: { commit_hash: source, branch: "staging" } },
        },
      ],
    });
  };
  const value = await captureDeployment({
    output: "https://12345678.mdbase-reader.pages.dev",
    target: "staging",
    sha: source,
    accountId: "fixture",
    apiToken: "fixture",
    fetchImpl,
  });
  assert.equal(value.id, id);
  await assert.rejects(
    captureDeployment({
      output: "https://12345678.mdbase-reader.pages.dev",
      target: "production",
      sha: source,
      accountId: "fixture",
      apiToken: "fixture",
      fetchImpl,
    }),
  );
});
test("built exact target and native/SQLite byte coverage fail closed", () => {
  assert.throws(() =>
    assertBuiltTarget({
      target: "staging",
      manifest: { homepage: "https://reader.mdbase.dev/" },
      routes: {},
    }),
  );
  assert.throws(() =>
    assertInventoryCoverage([], {
      nativeAssets: { "runtime.wasm": { bytes: 1, sha256: "e".repeat(64) } },
    }),
  );
});
async function servedFixture() {
  const root = await mkdtemp(join(tmpdir(), "reader-served-fixture-")),
    pub = join(root, "publish");
  await mkdir(join(pub, ".well-known"), { recursive: true });
  const files = {
    "index.html": "<html>reader</html>",
    "404.html": "<html>not found</html>",
    "app.js": "reader js",
    "runtime.wasm": "wasm",
    ".well-known/mdbase-app.json": "{}",
    ".nojekyll": "",
    "_worker.js": "precompiled source",
  };
  for (const path of ["_routes.json", "_redirects"])
    files[path] = await readFile(join(process.cwd(), "apps/reader/public", path));
  for (const [path, bytes] of Object.entries(files)) await writeFile(join(pub, path), bytes);
  const offline = await offlineFixture(pub);
  const inventory = await inventoryDirectory(pub);
  for (const row of inventory) files[row.path] = await readFile(join(pub, row.path));
  const plan = {
    sha: source,
    tree,
    origin,
    pagesBranch: "staging",
    sdkTrust: { environment: "staging", offlineShell: offline.original },
  };
  const deployment = {
    id,
    url: "https://12345678.mdbase-reader.pages.dev",
    sourceSha: source,
    pagesBranch: "staging",
  };
  const metadata = {
    project: { name: "mdbase-reader", id: "reader-id", production_branch: "main" },
    configuration: { compatibility_date: "2026-10-20", compatibility_flags: [] },
    deployment: { ...deployment, environment: "preview", status: "success" },
  };
  const transport = async (url) => {
    const path = new URL(url).pathname;
    assert.ok(path !== "/_worker.js" && !path.startsWith("/_worker.js/"));
    if (path === "/api/capture")
      return new Response(
        JSON.stringify({ code: "method_not_allowed", message: "Use POST to capture a page." }),
        {
          status: 405,
          headers: {
            "cache-control": "no-store",
            "content-type": "application/json",
            "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
            "x-content-type-options": "nosniff",
          },
        },
      );
    if (path.includes("native-publisher-not-found"))
      return new Response(files["404.html"], { status: 404 });
    return new Response(
      files[path === "/" || path.startsWith("/import") ? "index.html" : path.slice(1)] ?? "missing",
    );
  };
  return {
    root,
    inventory,
    publication: {
      repoRoot: process.cwd(),
      artifactRoot: root,
      plan,
      deployment,
      metadata,
      preflight: { project: { id: "reader-id" } },
    },
    transport,
  };
}
test("Pages Functions build emits advanced-mode modules, not a multipart outfile", async () => {
  const build = await readFile("scripts/qualify-native-staging.mjs", "utf8");
  const flag = build.match(
    /"(--out(?:file|dir))",\s*join\(repo, "apps\/reader\/dist\/_worker\.js"\)/,
  )?.[1];
  // Official Wrangler 4.114 semantics already exercised by Writer's synthetic
  // regression: outfile is a multipart upload body, outdir emits index.js.
  assert.equal(flag, "--outdir");
});
test("advanced-mode Worker retains every module/map in inventory and hosting coverage", async () => {
  const f = await servedFixture();
  try {
    const pub = join(f.root, "publish");
    await rm(join(pub, "_worker.js"));
    await mkdir(join(pub, "_worker.js"));
    // SYNTHETIC module/map DATA only; never compiled or executed.
    for (const [name, body] of Object.entries({
      "index.js": "export default {};",
      "module.mjs": "export {};",
      "index.js.map": "{}",
    }))
      await writeFile(join(pub, "_worker.js", name), body);
    const inventory = await inventoryDirectory(pub);
    assert.doesNotThrow(() => assertInventoryCoverage(inventory, { nativeAssets: {} }));
    const v = await verifyServedAssets({
      origin,
      inventory,
      publication: f.publication,
      fetch: f.transport,
      attempts: 1,
    });
    assert.equal(v.ok, true, JSON.stringify(v));
    assert.deepEqual(v.policyEvidence.coveredControls.map((a) => a.path).sort(), [
      "_redirects",
      "_routes.json",
      "_worker.js/index.js",
      "_worker.js/index.js.map",
      "_worker.js/module.mjs",
    ]);
    assert.ok(v.verified.every((a) => !a.path.startsWith("_worker.js/")));
    const args = {
      target: "staging",
      source: { sha: source, tree },
      releaseRef: "release/native-staging",
      sdkTrust: {},
      inventory,
      deploymentId: id,
      verification: v,
    };
    assert.equal(createReceipt(args).status, "verified");
    for (const mode of ["omitted-map", "changed-module"]) {
      const broken = structuredClone(v);
      if (mode === "omitted-map")
        broken.policyEvidence.coveredControls = broken.policyEvidence.coveredControls.filter(
          (a) => a.path !== "_worker.js/index.js.map",
        );
      else
        broken.policyEvidence.coveredControls.find(
          (a) => a.path === "_worker.js/module.mjs",
        ).sha256 = "0".repeat(64);
      assert.equal(createReceipt({ ...args, verification: broken }).status, "failed-or-incomplete");
    }
    const missingEntry = inventory.filter((a) => a.path !== "_worker.js/index.js");
    assert.throws(
      () => assertInventoryCoverage(missingEntry, {}),
      /Missing precompiled Pages Worker/,
    );
    const policy = await sourceHostingPolicy(process.cwd());
    assert.throws(
      () => coveredHostingControls(policy, missingEntry),
      /missing precompiled capture Worker/,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("ALL bytes + .nojekyll GET + source controls + 9 bounded route probes can verify", async () => {
  const f = await servedFixture();
  try {
    const v = await verifyServedAssets({
      origin,
      inventory: f.inventory,
      publication: f.publication,
      fetch: f.transport,
    });
    assert.equal(v.ok, true);
    assert.ok(v.verified.some((a) => a.path === ".nojekyll"));
    assert.equal(v.policyEvidence.behavior.length, 9);
    const receipt = createReceipt({
      target: "staging",
      source: { sha: source, tree },
      releaseRef: "release/native-staging",
      sdkTrust: {},
      inventory: f.inventory,
      deploymentId: id,
      verification: v,
    });
    assert.equal(receipt.status, "verified");
    assert.equal(
      createReceipt({
        target: "staging",
        source: { sha: source, tree },
        releaseRef: "release/native-staging",
        inventory: f.inventory,
        deploymentId: "12345678",
        verification: v,
      }).status,
      "failed-or-incomplete",
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
for (const mode of [
  "wrong-bytes",
  "no-policy",
  "unknown-control",
  "worker-http200-not-source-proof",
])
  test(mode + " is not publication success", async () => {
    const f = await servedFixture();
    try {
      if (mode === "unknown-control") {
        await writeFile(join(f.root, "publish/_headers"), "unknown");
        f.inventory = await inventoryDirectory(join(f.root, "publish"));
      }
      const v = await verifyServedAssets({
        origin,
        inventory: f.inventory,
        publication: mode === "no-policy" ? undefined : f.publication,
        attempts: 1,
        fetch:
          mode === "wrong-bytes" || mode === "worker-http200-not-source-proof"
            ? async () => new Response("marker")
            : f.transport,
      });
      assert.equal(v.ok, false);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
test("known controls are source byte bound, unknown nested controls refuse", async () => {
  const p = await sourceHostingPolicy(process.cwd());
  assert.throws(() =>
    coveredHostingControls(p, [
      ...Object.values(p.controls),
      { path: "_worker.js", bytes: 1, sha256: "a".repeat(64) },
      { path: "nested/_headers", bytes: 1, sha256: "b".repeat(64) },
    ]),
  );
  assert.equal(digest("x").length, 64);
});
