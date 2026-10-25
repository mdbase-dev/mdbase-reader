import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { checkLazyBoundaries, checkOfflineBundle, staticClosure } from "./check-bundle.mjs";

const chunk = (file, modules = [], imports = [], dynamicImports = []) => ({
  file,
  modules: modules.map((id) => ({ id })),
  imports,
  dynamicImports,
  entry: file === "entry.js",
});

test("static graph follows shared chunks but does not pull dynamic features into startup", () => {
  const chunks = [
    chunk("entry.js", [], ["shared.js"], ["library.js"]),
    chunk("shared.js"),
    chunk("workspace.js", ["/src/ReaderApp.tsx"], ["shared.js"]),
    chunk("library.js", ["/src/LibraryWorkspace.tsx"]),
  ];
  assert.deepEqual(
    staticClosure(chunks, ["entry.js"]).map(({ file }) => file),
    ["entry.js", "shared.js"],
  );
  assert.doesNotThrow(() => checkLazyBoundaries(chunks));
  chunks[2].imports.push("library.js");
  assert.throws(() => checkLazyBoundaries(chunks), /Eager secondary module/);
});

test("native connection gate defers the reading workspace until a collection opens", () => {
  const chunks = [
    chunk("entry.js"),
    chunk("gate.js", ["/src/SdkReaderRoot.tsx"], [], ["workspace.js"]),
    chunk("workspace.js", ["/src/ReaderWorkspace.tsx"]),
  ];
  assert.doesNotThrow(() => checkLazyBoundaries(chunks));
  chunks[1].imports.push("workspace.js");
  assert.throws(() => checkLazyBoundaries(chunks), /eagerly imports the reading workspace/);
});

test("rejects eager renderers and multiple YAML installations", () => {
  assert.throws(
    () => checkLazyBoundaries([chunk("entry.js", ["/packages/renderer-pdf/src/pdf-viewer.tsx"])]),
    /Eager secondary module/,
  );
  assert.throws(
    () =>
      checkLazyBoundaries([
        chunk("entry.js"),
        chunk("yaml-a.js", ["/a/yaml/browser/dist/index.js"]),
        chunk("yaml-b.js", ["/b/yaml/browser/dist/index.js"]),
      ]),
    /Duplicated YAML/,
  );
});

test("precache contains unvisited lazy chunks, workers and WASM with their exact hashes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reader-offline-bundle-"));
  try {
    await mkdir(join(directory, "assets"));
    const files = [
      "index.html",
      "assets/lazy-renderer.js",
      "assets/worker.js",
      "assets/engine.wasm",
    ];
    const assets = files.map((path) => ({
      path,
      sha256: createHash("sha256").update(path).digest("hex"),
    }));
    await Promise.all(files.map((path) => writeFile(join(directory, path), path)));
    const writeWorker = (assets) =>
      writeFile(
        join(directory, "mdbase-shell-sw.js"),
        `installOfflineShell(self, ${JSON.stringify({ assets })});`,
      );
    await writeWorker(assets);
    assert.equal(await checkOfflineBundle(directory), files.length);
    await writeWorker(assets.filter(({ path }) => !path.endsWith(".wasm")));
    await assert.rejects(checkOfflineBundle(directory), /Offline precache missing\/stale/);
    await writeWorker(assets);
    await writeFile(join(directory, "assets/lazy-renderer.js"), "changed");
    await assert.rejects(checkOfflineBundle(directory), /Offline precache missing\/stale/);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
