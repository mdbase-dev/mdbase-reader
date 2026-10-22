import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, access, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { createExtensionZip, validateExistingExtensionZip } from "../lib/reader-extension.mjs";
import { checkpointMetadataHttp } from "../lib/native-artifact.mjs";
import { inventoryDirectory } from "../lib/native-publish-bytes.mjs";
import { digest } from "./reader-offline-fixture.mjs";

test("actual protected pnpm selection resolves tools11.15, leaving source manager10.7 unchanged", async () => {
  const workflow = parse(await readFile(".github/workflows/deploy-reader.yml", "utf8"));
  const setup = workflow.jobs["native-upload"].steps.find((s) =>
    s.uses?.startsWith("pnpm/action-setup@"),
  );
  const selected = setup.with.package_json_file ?? "package.json";
  const manifest = JSON.parse(await readFile(selected, "utf8"));
  assert.equal(manifest.packageManager, "pnpm@" + setup.with.version);
  assert.equal(selected, "tools/native-publisher/package.json");
  assert.equal(JSON.parse(await readFile("package.json", "utf8")).packageManager, "pnpm@10.7.0");
});
test("validate-existing exact ZIP is READ ONLY and missing/stale hash/extra member cannot cause reconstruction", async () => {
  const root = await mkdtemp(join(tmpdir(), "reader-existing-zip-"));
  try {
    await mkdir(join(root, "extension"));
    await writeFile(join(root, "extension/manifest.json"), "{}");
    const inventory = await inventoryDirectory(join(root, "extension"));
    await assert.rejects(validateExistingExtensionZip(root, inventory, "a".repeat(64)));
    await assert.rejects(access(join(root, "extension.zip")));
    await createExtensionZip(root, inventory); // Disposable DATA fixture only.
    const before = await readFile(join(root, "extension.zip")),
      expected = digest(before);
    assert.equal((await validateExistingExtensionZip(root, inventory, expected)).length, 1);
    for (const sha of [undefined, "bad", "a".repeat(64)])
      await assert.rejects(validateExistingExtensionZip(root, inventory, sha));
    await assert.rejects(validateExistingExtensionZip(root, [], expected));
    assert.deepEqual(await readFile(join(root, "extension.zip")), before);
    await rm(join(root, "extension.zip"));
    await writeFile(join(root, "target.zip"), before);
    await symlink(join(root, "target.zip"), join(root, "extension.zip"));
    await assert.rejects(validateExistingExtensionZip(root, inventory, expected));
    assert.deepEqual(await readFile(join(root, "target.zip")), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
for (const kind of ["read-error", "overflow", "declared-mismatch", "timeout"])
  test(`shared metadata/redirect/ZIP capture labels incomplete ${kind} prefix, not complete identity`, async (context) => {
    const state = { stage: "before" },
      snapshots = [];
    let ready,
      count = 0;
    const stalled = new Promise((resolve) => {
      ready = resolve;
    });
    if (kind === "timeout") context.mock.timers.enable({ apis: ["setTimeout"] });
    const response = {
      status: 200,
      ok: true,
      headers: new Headers(kind === "declared-mismatch" ? { "content-length": "100" } : {}),
      body: {
        getReader: () => ({
          cancel: async () => {},
          read: async () => {
            assert.equal(snapshots[0].responses.before.httpStatus, 200);
            if (++count === 1) return { done: false, value: Buffer.from("opaque-private-error") };
            ready();
            if (kind === "timeout") return new Promise(() => {});
            if (kind === "read-error") throw Error("opaque-private-error");
            if (kind === "overflow")
              return { done: false, value: Buffer.alloc(2 * 1024 * 1024 + 1) };
            return { done: true };
          },
        }),
      },
    };
    try {
      const rejected = assert.rejects(
        checkpointMetadataHttp(response, {
          state,
          save: async (s) => snapshots.push(structuredClone(s)),
        }),
      );
      if (kind === "timeout") {
        await stalled;
        context.mock.timers.tick(30000);
      }
      await rejected;
      const body = state.responses.before;
      assert.equal(body.bodyComplete, false);
      assert.equal(body.bodyIdentity, "incomplete-prefix");
      assert.equal(body.bodyTruncated, kind === "overflow");
      assert.equal(body.bodyTimedOut, kind === "timeout");
      assert.equal(body.bodyReadError, kind === "read-error");
      assert.equal(body.publicBody, undefined);
      assert.ok(!JSON.stringify(snapshots).includes("opaque-private-error"));
    } finally {
      context.mock.timers.reset();
    }
  });
