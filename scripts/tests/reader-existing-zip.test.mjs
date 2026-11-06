import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, access, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { createExtensionZip, validateExistingExtensionZip } from "../lib/reader-extension.mjs";
import { inventoryDirectory } from "../lib/native-publish-bytes.mjs";
import { digest } from "./reader-offline-fixture.mjs";

test("protected upload installs no pnpm workspace; source manager remains unchanged", async () => {
  const workflow = parse(await readFile(".github/workflows/deploy-reader.yml", "utf8"));
  assert.ok(!workflow.jobs.publish.steps.some((s) => s.uses?.startsWith("pnpm/action-setup@")));
  assert.ok(workflow.jobs.publish.steps.some((s) => s.run?.includes("publisher/tool.mjs")));
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
