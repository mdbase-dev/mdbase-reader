import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

const source = await readFile(new URL("../src/bootstrap.js", import.meta.url), "utf8");

test("native action opens only the fixed importer URL after completion, without local paths", () => {
  const launched = [];
  const scope = vm.createContext({
    Zotero: { launchURL: (url) => launched.push(url) },
  });
  vm.runInContext(source, scope);
  const controller = { state: { phase: "idle", destination: "/private/Zotero export" } };
  scope.ReaderExporter = { controller, stopped: false };
  let actions;
  scope.openExporter({
    openDialog(...args) {
      actions = args[3];
      return { closed: false };
    },
  });
  assert.ok(actions);
  assert.equal(launched.length, 0);
  for (const phase of ["idle", "ready", "exporting", "cancelled", "failed"]) {
    controller.state.phase = phase;
    actions.openImporter();
    assert.equal(launched.length, 0);
  }
  controller.state.phase = "complete";
  actions.openImporter();
  assert.deepEqual(launched, ["https://reader.mdbase.dev/import/zotero"]);
  scope.ReaderExporter.stopped = true;
  actions.openImporter();
  assert.equal(launched.length, 1);
});
