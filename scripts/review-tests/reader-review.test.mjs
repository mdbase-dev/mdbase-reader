// Qualified DATA/transport regression suite. Needs only the original PUBLIC
// transport at reader-staging-public-input.json; never a keyring or network.
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { loadOriginals } from "../lib/native-originals.mjs";
import { approvedHashes } from "../lib/reader-approved-intake.mjs";
import { download } from "../lib/native-artifact.mjs";
import { assertExtensionZip, createExtensionZip } from "../lib/reader-extension.mjs";
import { inventoryDirectory } from "../lib/native-publish-bytes.mjs";
import { offlineFixture, digest } from "../tests/reader-offline-fixture.mjs";

let publicInput;
before(async () => {
  // ALL originals/facts and exact installer classifier BEFORE candidate use.
  const trust = await loadOriginals({
    target: "staging",
    repoRoot: process.cwd(),
    hashes: approvedHashes,
    installed: true,
  });
  assert.equal(trust.archives.sdk.members, 896);
  assert.equal(trust.archives.ui.members, 81);
  assert.equal(trust.archives.protocol.members, 67);
  assert.equal(trust.legacyArchive.members, 275);
  const bytes = await readFile("reader-staging-public-input.json");
  assert.equal(digest(bytes), "c4fd1e54e814112db350a050ede7d81947b2268b30591697051760660370340d");
  publicInput = JSON.parse(bytes);
});

function selectedManager(step, manifests) {
  const selected = step.with?.package_json_file ?? "package.json";
  const manager = manifests[selected]?.packageManager;
  assert.match(manager ?? "", /^pnpm@\d+\.\d+\.\d+$/);
  const version = manager.slice(5);
  assert.equal(
    String(step.with?.version ?? version),
    version,
    `Action version conflicts with ${selected}`,
  );
  return { selected, version };
}
test("R1 actual protected action selects compatible ISOLATED tools manifest, not root10.7", async () => {
  const workflow = parse(await readFile(".github/workflows/deploy-reader.yml", "utf8"));
  const manifests = {};
  for (const path of ["package.json", "tools/native-publisher/package.json"])
    manifests[path] = JSON.parse(await readFile(path, "utf8"));
  const steps = workflow.jobs["native-upload"].steps;
  const step = steps.find((s) => s.uses?.startsWith("pnpm/action-setup@"));
  const actual = selectedManager(step, manifests); // evaluates actual default/selected manifest
  assert.deepEqual(actual, { selected: "tools/native-publisher/package.json", version: "11.15.1" });
  assert.equal(manifests["package.json"].packageManager, "pnpm@10.7.0");
  assert.throws(() => selectedManager({ with: { version: "11.15.1" } }, manifests), /conflicts/);
  assert.deepEqual(selectedManager({ with: {} }, manifests), {
    selected: "package.json",
    version: "10.7.0",
  });
});

const identity = {
  id: "42",
  run: "123",
  attempt: "2",
  source: "a".repeat(40),
  tree: "b".repeat(40),
  target: "staging",
  repository: "owner/reader",
  repositoryId: "11",
  event: "workflow_dispatch",
};
const run = {
  id: 123,
  repository: { full_name: identity.repository, id: 11 },
  head_sha: identity.source,
  run_attempt: 2,
  event: "workflow_dispatch",
  head_branch: "release/native-staging",
};
const canary = "OPAQUE-PRIVATE-ERROR-NEVER-RETAIN";
const blobUrl = "https://blob.invalid/original.zip?sig=PRIVATE-SAS-NEVER-RETAIN";
async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), "reader-review-")),
    source = join(parent, "source");
  for (const dir of ["publish", "extension/.well-known"])
    await mkdir(join(source, dir), { recursive: true });
  await writeFile(join(source, "publish/index.html"), "<html>DATA fixture</html>");
  const offline = await offlineFixture(join(source, "publish"));
  const trust = {
    environment: "staging",
    appOrigin: "https://reader-staging.mdbase.dev",
    connectOrigin: "https://connect-staging.mdbase.dev",
    release: { logOrigin: "https://log-staging.mdbase.dev" },
    archives: { sdk: { members: 896 }, protocol: { members: 67 } },
    installerPolicy: { originalYamlMembers: 233 },
    offlineShell: offline.original,
  };
  await writeFile(
    join(source, "extension/manifest.json"),
    JSON.stringify({
      key: publicInput.publicSpkiBase64,
      manifest_version: 3,
      name: "DATA (STAGING)",
      homepage_url: trust.appOrigin + "/",
      host_permissions: [trust.connectOrigin + "/*", trust.release.logOrigin + "/*"],
    }),
  );
  await writeFile(
    join(source, "extension/.well-known/mdbase-app.json"),
    JSON.stringify({
      id: "dev.mdbase.reader.extension",
      homepage: trust.appOrigin + "/",
      installation_origins: {
        staging: { "app-runtime": ["chrome-extension://palmhjikdacodimpnkapmidobfbocdgf"] },
      },
    }),
  );
  const inventory = await inventoryDirectory(join(source, "publish"));
  const ext = await inventoryDirectory(join(source, "extension"));
  await createExtensionZip(source, ext);
  const files = {
    "inventory.json": JSON.stringify(inventory),
    "extension-inventory.json": JSON.stringify(ext),
    "plan.json": JSON.stringify({ sha: identity.source, tree: identity.tree, sdkTrust: trust }),
    "installer-evidence.json": "[]",
  };
  await writeFile(
    join(source, "envelope.json"),
    JSON.stringify({
      ...identity,
      inventorySha256: digest(files["inventory.json"]),
      planSha256: digest(files["plan.json"]),
      extensionInventorySha256: digest(files["extension-inventory.json"]),
      installerEvidenceSha256: digest(files["installer-evidence.json"]),
      extensionZipSha256: digest(await readFile(join(source, "extension.zip"))),
    }),
  );
  for (const [path, bytes] of Object.entries(files)) await writeFile(join(source, path), bytes);
  // Synthetic DATA archive only. Never repackage the real historical output.
  execFileSync("python3", [
    "-I",
    "-B",
    "-c",
    `import pathlib,sys,zipfile
r=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2],'x') as z:
 for p in sorted(r.rglob('*')):
  if p.is_file():z.write(p,p.relative_to(r).as_posix())`,
    source,
    join(parent, "fixture.zip"),
  ]);
  const bytes = await readFile(join(parent, "fixture.zip"));
  const expected = { ...identity, digest: "sha256:" + digest(bytes) };
  return { parent, root: join(parent, "artifact"), bytes, expected };
}
async function absent(path) {
  await assert.rejects(access(path));
}
async function evidence(f) {
  return JSON.parse(await readFile(join(f.parent, "artifact-metadata.json")));
}
function meta(expected) {
  return {
    id: 42,
    expired: false,
    digest: expected.digest,
    name: "reader-native-build-staging-123-2",
    workflow_run: { id: 123, head_sha: identity.source, head_repository_id: 11 },
  };
}
function transport(f, { redirect, bytes = f.bytes, after, runAfter, inspect = true } = {}) {
  const calls = [];
  const fetch = async (url, options) => {
    const n = calls.length + 1;
    calls.push(String(url));
    // EVERY preceding observation must already be on DISK before next lookup.
    if (inspect && n > 1) {
      const saved = await evidence(f);
      if (n === 2) assert.equal(saved.before.id, 42);
      if (n === 3) assert.equal(saved.run.run_attempt, 2);
      if (n === 4) {
        assert.equal(saved.responses.archive.httpStatus, 302);
        assert.equal(saved.responses.archive.bodyComplete, true);
        assert.equal(options.headers, undefined); // never forward GitHub auth to blob
      }
      if (n === 5) {
        assert.deepEqual(saved.downloadedZip, {
          bytes: bytes.length,
          sha256: digest(bytes),
          complete: true,
        });
        await absent(f.root); // no extraction until BOTH post observations
      }
      if (n === 6) assert.equal(saved.after.id, 42);
    }
    if (n === 1 || n === 5) {
      assert.equal(String(url), "https://api.github.com/repos/owner/reader/actions/artifacts/42");
      return n === 5 && after ? after() : Response.json(meta(f.expected));
    }
    if (n === 2 || n === 6) {
      assert.equal(String(url), "https://api.github.com/repos/owner/reader/actions/runs/123");
      return n === 6 && runAfter ? runAfter() : Response.json(run);
    }
    if (n === 3)
      return redirect
        ? redirect()
        : new Response("complete NON-JSON " + canary, {
            status: 302,
            headers: { location: blobUrl },
          });
    if (n === 4) {
      assert.equal(String(url), blobUrl);
      return new Response(bytes);
    }
    throw Error("unexpected mock lookup");
  };
  return { calls, fetch };
}
function safe(saved) {
  const text = JSON.stringify(saved);
  for (const forbidden of [canary, "PRIVATE-SAS", "location", "Authorization", "Bearer"])
    assert.ok(!text.includes(forbidden), "opaque/credential/header evidence leaked");
}
test("R2 complete NON-JSON302 positive: REAL download + ALL strict directory/digest/source guards PASS", async () => {
  const f = await fixture();
  try {
    const t = transport(f, { inspect: false }); // old code positive independent of new evidence fields
    await download(f.expected, f.root, t.fetch);
    assert.equal(t.calls.length, 6);
    const saved = await evidence(f);
    assert.equal(saved.status, "validated");
    assert.equal(saved.runAfter.run_attempt, 2);
    safe(saved);
  } finally {
    await rm(f.parent, { recursive: true, force: true });
  }
});
for (const kind of ["overflow", "read-error", "timeout"])
  test(`R2 actual download ${kind}302: zero BLOB/ZIP/full-download identity; safe incomplete checkpoint`, async (context) => {
    const f = await fixture();
    let ready,
      statusBeforeRead = false;
    const stalled = new Promise((resolve) => {
      ready = resolve;
    });
    if (kind === "timeout") context.mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const t = transport(f, {
        inspect: false,
        redirect: () => {
          let reads = 0;
          return {
            status: 302,
            headers: new Headers({ location: blobUrl }),
            body: {
              getReader: () => ({
                cancel: async () => {},
                read: async () => {
                  if (++reads === 1) {
                    const initial = await evidence(f);
                    assert.equal(initial.responses.archive.httpStatus, 302);
                    assert.equal(
                      initial.responses.archive.bodyState,
                      "bounded-public-body-pending",
                    );
                    statusBeforeRead = true;
                    return { done: false, value: Buffer.from(canary) };
                  }
                  ready();
                  if (kind === "timeout") return new Promise(() => {});
                  if (kind === "read-error") throw Error(canary);
                  return { done: false, value: Buffer.alloc(2 * 1024 * 1024 + 1) };
                },
              }),
            },
          };
        },
      });
      const result = download(f.expected, f.root, t.fetch);
      const refusal = assert.rejects(result);
      if (kind === "timeout") {
        // On unchanged63 the body is never read. Wait until download completes OR
        // reader stalls so the causal test cannot hang on the defective code.
        await Promise.race([stalled, result.catch(() => {})]);
        context.mock.timers.tick(30000);
      }
      await refusal;
      assert.equal(statusBeforeRead, true, "numeric status checkpoint BEFORE first body read");
      assert.equal(t.calls.length, 3, "incomplete redirect must stop BEFORE BLOB");
      const saved = await evidence(f),
        body = saved.responses.archive;
      assert.equal(body.httpStatus, 302);
      assert.equal(body.bodyComplete, false);
      assert.equal(body.bodyIdentity, "incomplete-prefix");
      const prefix =
        kind === "overflow"
          ? Buffer.concat([Buffer.from(canary), Buffer.alloc(2 * 1024 * 1024)]).subarray(
              0,
              2 * 1024 * 1024,
            )
          : Buffer.from(canary);
      assert.equal(body.bodyBytes, prefix.length);
      assert.equal(body.bodySha256, digest(prefix));
      assert.equal(body.bodyTruncated, kind === "overflow");
      assert.equal(body.bodyReadError, kind === "read-error");
      assert.equal(body.bodyTimedOut, kind === "timeout");
      assert.equal(body.bodyRefusal, "body-" + (kind === "overflow" ? "byte-limit" : kind));
      assert.equal(saved.downloadedZip, undefined);
      await absent(join(f.parent, "reader-native.zip"));
      await absent(f.root);
      safe(saved);
    } finally {
      context.mock.timers.reset();
      await rm(f.parent, { recursive: true, force: true });
    }
  });
for (const kind of ["digest-mismatch", "invalid-zip", "traversal"])
  test(`R3 COMPLETE ${kind}: actual ZIP identity + both post observations BEFORE refusal/extraction`, async () => {
    const f = await fixture();
    try {
      let bytes = Buffer.from("not a ZIP " + canary);
      if (kind === "traversal") {
        execFileSync("python3", [
          "-I",
          "-B",
          "-c",
          "import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1],'w') as z:z.writestr('../escape','DATA')",
          join(f.parent, "bad.zip"),
        ]);
        bytes = await readFile(join(f.parent, "bad.zip"));
      }
      if (kind !== "digest-mismatch") f.expected.digest = "sha256:" + digest(bytes);
      const t = transport(f, { bytes });
      await assert.rejects(download(f.expected, f.root, t.fetch));
      const saved = await evidence(f);
      assert.deepEqual(saved.downloadedZip, {
        bytes: bytes.length,
        sha256: digest(bytes),
        complete: true,
      });
      assert.equal(t.calls.length, 6);
      for (const key of ["before", "run", "after", "runAfter"]) assert.ok(saved[key]);
      if (kind === "digest-mismatch") {
        await absent(f.root);
        await absent(join(f.parent, "reader-native.zip"));
        assert.equal(saved.primaryFailure.reason, "download-digest-mismatch");
      }
      await absent(join(f.parent, "escape"));
      safe(saved);
    } finally {
      await rm(f.parent, { recursive: true, force: true });
    }
  });
test("R3 actual complete ZIP status/body/sha and EACH metadata response are on DISK BEFORE next lookup/extraction", async () => {
  const f = await fixture();
  try {
    const t = transport(f);
    await download(f.expected, f.root, t.fetch);
    const saved = await evidence(f);
    assert.equal(saved.status, "validated");
    assert.equal(t.calls.length, 6);
    safe(saved);
  } finally {
    await rm(f.parent, { recursive: true, force: true });
  }
});
for (const failure of [
  "after-HTTP403",
  "after-digest",
  "runAfter-HTTP429",
  "wrong-attempt",
  "wrong-repository",
  "wrong-head",
  "wrong-event",
  "wrong-branch",
])
  test(`R3 complete ZIP survives later ${failure}; original guards remain fail closed`, async () => {
    const f = await fixture();
    try {
      const after = () =>
        failure === "after-HTTP403"
          ? Response.json({ message: "Not Found" }, { status: 403 })
          : Response.json({ ...meta(f.expected), digest: "sha256:" + "f".repeat(64) });
      const changed = {
        "wrong-attempt": { run_attempt: 1 },
        "wrong-repository": { repository: { full_name: "other/repo", id: 12 } },
        "wrong-head": { head_sha: "c".repeat(40) },
        "wrong-event": { event: "push" },
        "wrong-branch": { head_branch: "main" },
      };
      const t = transport(f, {
        inspect: false,
        ...(failure.startsWith("after-")
          ? { after }
          : {
              runAfter: () =>
                failure === "runAfter-HTTP429"
                  ? Response.json({ message: "Too Many Requests" }, { status: 429 })
                  : Response.json({ ...run, ...changed[failure] }),
            }),
      });
      await assert.rejects(download(f.expected, f.root, t.fetch));
      const saved = await evidence(f);
      assert.deepEqual(saved.downloadedZip, {
        bytes: f.bytes.length,
        sha256: digest(f.bytes),
        complete: true,
      });
      assert.ok(saved.before && saved.run);
      assert.equal(saved.status, "failed-or-incomplete");
      await absent(f.root);
      await absent(join(f.parent, "reader-native.zip"));
      safe(saved);
    } finally {
      await rm(f.parent, { recursive: true, force: true });
    }
  });
test("R3 digest mismatch remains PRIMARY with safe secondary HTTP failure, no masking or extraction", async () => {
  const f = await fixture();
  try {
    const bytes = Buffer.from("bad complete ZIP");
    const t = transport(f, {
      inspect: false,
      bytes,
      runAfter: () => Response.json({ message: "Too Many Requests" }, { status: 429 }),
    });
    await assert.rejects(download(f.expected, f.root, t.fetch));
    const saved = await evidence(f);
    assert.equal(saved.primaryFailure.reason, "download-digest-mismatch");
    assert.deepEqual(saved.secondaryFailure, {
      stage: "runAfter",
      reason: "metadata-lookup-refused",
    });
    assert.equal(saved.downloadedZip.sha256, digest(bytes));
    assert.ok(saved.after && saved.responses.runAfter.httpStatus === 429);
    await absent(f.root);
    safe(saved);
  } finally {
    await rm(f.parent, { recursive: true, force: true });
  }
});
for (const kind of ["directory-without-slash", "extra-directory", "DOS-directory-bit", "mode-zero"])
  test(`R4 REAL extension ZIP validator rejects ${kind} with OTHERWISE IDENTICAL payload bytes`, async () => {
    const root = await mkdtemp(join(tmpdir(), "reader-member-type-"));
    try {
      const inventory = [{ path: "manifest.json", bytes: 2, sha256: digest("{}") }];
      execFileSync("python3", [
        "-I",
        "-B",
        "-c",
        `import stat,sys,zipfile
kind=sys.argv[2]
with zipfile.ZipFile(sys.argv[1],'x') as z:
 i=zipfile.ZipInfo('manifest.json');i.create_system=3;i.external_attr=(stat.S_IFREG|0o644)<<16
 if kind=='directory-without-slash':i.external_attr=(stat.S_IFDIR|0o755)<<16
 if kind=='DOS-directory-bit':i.external_attr|=0x10
 if kind=='mode-zero':i.create_system=0;i.external_attr=0x20
 z.writestr(i,'{}')
 if kind=='extra-directory':
  d=zipfile.ZipInfo('extra/');d.create_system=3;d.external_attr=((stat.S_IFDIR|0o755)<<16)|0x10;z.writestr(d,'')`,
        join(root, "extension.zip"),
        kind,
      ]);
      await assert.rejects(assertExtensionZip(root, inventory));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
