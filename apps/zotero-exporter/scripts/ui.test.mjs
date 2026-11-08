import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

const source = await readFile(new URL("../src/content/export.js", import.meta.url), "utf8");
function mount() {
  const events = new Map(),
    nodes = new Map();
  let loaded = false,
    render,
    cancelled = 0,
    detached = 0,
    opened = 0;
  const node = (tagName = "div") => ({
    tagName,
    textContent: "",
    set innerHTML(value) {
      assert.fail(`UI must use textContent, not HTML: ${String(value)}`);
    },
    children: [],
    listeners: {},
    removeAttribute() {},
    replaceChildren() {
      this.children = [];
    },
    append(...children) {
      this.children.push(...children);
    },
    addEventListener(name, callback) {
      this.listeners[name] = callback;
    },
  });
  const document = {
    getElementById(id) {
      assert.ok(loaded, "must wait for DOMContentLoaded in privileged XHTML");
      if (!nodes.has(id)) nodes.set(id, node());
      return nodes.get(id);
    },
    createElementNS(namespace, tagName) {
      assert.equal(namespace, "http://www.w3.org/1999/xhtml");
      return node(tagName);
    },
  };
  const controller = {
    busy: false,
    state: { phase: "idle", message: "Choose a folder" },
    subscribe(fn) {
      render = fn;
      fn(this.state);
      return () => {};
    },
    cancel() {
      cancelled++;
    },
  };
  const actions = {
    controller,
    openImporter() {
      opened++;
    },
    detached() {
      detached++;
    },
  };
  const window = {
    arguments: [actions],
    addEventListener(name, callback) {
      events.set(name, callback);
    },
    close() {},
  };
  vm.runInNewContext(source, { window, document });
  assert.equal(nodes.size, 0);
  loaded = true;
  events.get("DOMContentLoaded")();
  return {
    controller,
    nodes,
    events,
    actions,
    render(state) {
      controller.state = state;
      render(state);
    },
    cancelled: () => cancelled,
    detached: () => detached,
    opened: () => opened,
  };
}

test("initializes only after XHTML DOM is ready", () => {
  const ui = mount();
  assert.equal(ui.nodes.get("status").textContent, "Choose a folder");
  assert.equal(ui.nodes.get("start").disabled, true);
});
test("close while exporting cancels instead of abandoning a live job", () => {
  const ui = mount();
  ui.controller.busy = true;
  let prevented = false;
  ui.events.get("close")({
    preventDefault() {
      prevented = true;
    },
  });
  assert.ok(prevented);
  assert.equal(ui.cancelled(), 1);
  ui.events.get("unload")();
  assert.equal(ui.detached(), 1);
});
test("completion warnings use titles and recovery text, not HTML, and retain diagnostics", () => {
  const ui = mount();
  ui.render({
    phase: "complete",
    message: "Done",
    manifest: {
      counts: {
        items: 1,
        notes: 0,
        annotations: 0,
        collections: 0,
        availableAttachments: 0,
        missingAttachments: 1,
        files: 0,
      },
      warnings: [
        { code: "missing-file", key: "<script>bad</script>", title: "<img src=x onerror=bad()>" },
      ],
    },
  });
  assert.equal(ui.nodes.get("reveal").hidden, false);
  assert.equal(ui.nodes.get("warnings").hidden, false);
  assert.equal(ui.nodes.get("warnings").open, true);
  assert.match(ui.nodes.get("warning-count").textContent, /^1 warning —/);
  const [title, description, details] = ui.nodes.get("warning-list").children[0].children;
  assert.equal(title.tagName, "strong");
  assert.equal(title.textContent, "<img src=x onerror=bad()>");
  assert.match(description.textContent, /Download or locate the file in Zotero, then export again/);
  assert.equal(details.tagName, "details");
  assert.equal(details.children[0].textContent, "Technical details");
  assert.equal(
    details.children[1].textContent,
    "Code: missing-file · Item key: <script>bad</script>",
  );
  assert.notEqual(details.open, true);
});

test("known warnings explain retained data and unknown codes have a safe fallback", () => {
  const ui = mount();
  ui.render({
    phase: "complete",
    manifest: {
      warnings: [
        { code: "missing-parent", key: "NOTE", parent: "<missing>", title: "Note title" },
        { code: "csl-unavailable", key: "SOURCE", title: "Book title" },
        { code: "future-code", key: "FUTURE" },
        { code: "__proto__", key: "OTHER" },
        { code: "missing-file", key: "ATTACHMENT", title: " " },
      ],
    },
  });
  const items = ui.nodes.get("warning-list").children;
  assert.equal(items[0].children[0].textContent, "Note title");
  assert.match(items[0].children[1].textContent, /item is retained/);
  assert.match(items[0].children[1].textContent, /Zotero's trash/);
  assert.match(items[0].children[2].children[1].textContent, /Parent key: <missing>/);
  assert.equal(items[1].children[0].textContent, "Book title");
  assert.match(items[1].children[1].textContent, /Citation details could not be generated/);
  assert.match(items[1].children[1].textContent, /Zotero metadata is included/);
  assert.equal(items[2].children[0].textContent, "Untitled item");
  assert.match(items[2].children[1].textContent, /Review the technical details before importing/);
  assert.equal(items[3].children[1].textContent, items[2].children[1].textContent);
  assert.equal(items[4].children[0].textContent, "Untitled attachment");
  assert.match(ui.nodes.get("warning-count").textContent, /^5 warnings —/);
});

test("warnings clear on retry and refresh on a later export", () => {
  const ui = mount();
  ui.render({
    phase: "complete",
    manifest: { warnings: [{ code: "missing-file", key: "OLD", title: "Old title" }] },
  });
  ui.render({ phase: "scanning" });
  assert.equal(ui.nodes.get("warnings").hidden, true);
  assert.equal(ui.nodes.get("warning-list").children.length, 0);
  ui.render({
    phase: "complete",
    manifest: { warnings: [{ code: "csl-unavailable", key: "NEW", title: "New title" }] },
  });
  assert.equal(ui.nodes.get("warning-list").children[0].children[0].textContent, "New title");
  ui.render({ phase: "complete", manifest: { warnings: [] } });
  assert.equal(ui.nodes.get("warnings").hidden, true);
  assert.equal(ui.nodes.get("warning-list").children.length, 0);
});

test("Reader importer is an explicit completion-only action, not an automatic upload", async () => {
  const ui = mount();
  const open = ui.nodes.get("open-reader");
  for (const phase of [
    "idle",
    "scanning",
    "ready",
    "exporting",
    "cancelling",
    "cancelled",
    "failed",
  ]) {
    ui.render({ phase });
    assert.equal(open.hidden, true);
    assert.equal(ui.nodes.get("next-step").hidden, true);
    await open.listeners.click();
    assert.equal(ui.opened(), 0);
  }
  ui.render({ phase: "complete", manifest: { warnings: [] } });
  assert.equal(open.hidden, false);
  assert.equal(ui.nodes.get("next-step").hidden, false);
  assert.equal(ui.nodes.get("start").hidden, true);
  assert.equal(ui.opened(), 0);
  await open.listeners.click();
  assert.equal(ui.opened(), 1);
  ui.render({ phase: "ready" });
  assert.equal(ui.nodes.get("start").hidden, false);
  assert.equal(open.hidden, true);
  await open.listeners.click();
  assert.equal(ui.opened(), 1);
});

test("failure to open the importer is reported without losing the completed export", async () => {
  const ui = mount();
  ui.render({ phase: "complete", destination: "/private/export" });
  ui.actions.openImporter = async () => {
    throw new Error("Browser could not open");
  };
  await ui.nodes.get("open-reader").listeners.click();
  assert.equal(ui.nodes.get("problem").hidden, false);
  assert.equal(ui.nodes.get("problem").textContent, "Browser could not open");
  assert.equal(ui.nodes.get("reveal").hidden, false);
  assert.equal(ui.nodes.get("destination").textContent, "/private/export");
  assert.equal(ui.controller.state.phase, "complete");
});
