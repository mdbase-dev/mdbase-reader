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
    detached = 0;
  const node = () => ({
    textContent: "",
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
    createElementNS(namespace) {
      assert.equal(namespace, "http://www.w3.org/1999/xhtml");
      return node();
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
  const window = {
    arguments: [
      {
        controller,
        detached() {
          detached++;
        },
      },
    ],
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
    render: (s) => render(s),
    cancelled: () => cancelled,
    detached: () => detached,
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
test("completion warnings use text, not HTML, and unlock folder reveal", () => {
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
      warnings: [{ code: "missing-file", key: "<script>bad</script>" }],
    },
  });
  assert.equal(ui.nodes.get("reveal").hidden, false);
  assert.equal(
    ui.nodes.get("warning-list").children[0].textContent,
    "missing-file: <script>bad</script>",
  );
});
