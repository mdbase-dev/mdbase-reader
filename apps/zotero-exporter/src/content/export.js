/* global window, document */
"use strict";
window.addEventListener(
  "DOMContentLoaded",
  () => {
    const actions = window.arguments[0];
    const controller = actions.controller;
    const el = (id) => document.getElementById(id);
    const bytes = (n) => `${(n / 1024 ** 3).toFixed(2)} GiB`;
    let picking = false;
    let warningsRendered = null;

    function warningItem(warning) {
      const create = (tag, text) => {
        const node = document.createElementNS("http://www.w3.org/1999/xhtml", tag);
        if (text) node.textContent = text;
        return node;
      };
      const messages = {
        "missing-file":
          "This file is unavailable. Its Zotero metadata is included. Download or locate the file in Zotero, then export again.",
        "missing-parent":
          "This item's parent was not exported. The item is retained; check whether its parent is missing or in Zotero's trash.",
        "csl-unavailable":
          "Citation details could not be generated. Zotero metadata is included; check this item in Zotero and export again.",
      };
      const title = typeof warning.title === "string" ? warning.title.trim() : "";
      const item = create("li");
      const details = create("details");
      details.append(
        create("summary", "Technical details"),
        create(
          "p",
          `Code: ${warning.code} · Item key: ${warning.key}${warning.parent ? ` · Parent key: ${warning.parent}` : ""}`,
        ),
      );
      item.append(
        create(
          "strong",
          title || (warning.code === "missing-file" ? "Untitled attachment" : "Untitled item"),
        ),
        create(
          "p",
          Object.hasOwn(messages, warning.code)
            ? messages[warning.code]
            : "Some export details are unavailable. Review the technical details before importing.",
        ),
        details,
      );
      return item;
    }

    function render(state) {
      const busy = controller.busy;
      el("status").textContent = state.message;
      el("destination").textContent =
        state.destination ||
        state.parent ||
        "A new, uniquely named folder will be created inside it. Existing folders are never overwritten.";
      el("choose").disabled = busy || picking;
      el("start").disabled = state.phase !== "ready" || picking;
      el("start").hidden = state.phase === "complete";
      el("cancel").hidden = !busy;
      el("cancel").disabled = state.phase === "cancelling";
      el("close").disabled = busy;
      el("reveal").hidden = state.phase !== "complete";
      el("open-reader").hidden = state.phase !== "complete";
      el("next-step").hidden = state.phase !== "complete";
      el("progress").hidden = !busy;
      if (state.phase === "exporting" && state.total) {
        el("progress").max = state.total;
        el("progress").value = state.completed;
        el("progress-label").textContent =
          `${state.completed.toLocaleString()} of ${state.total.toLocaleString()} attachment records processed`;
      } else {
        el("progress").removeAttribute("value");
        el("progress-label").textContent = "";
      }
      const counts = state.manifest?.counts;
      const plan = state.plan;
      const rows = counts
        ? [
            ["Sources", counts.items],
            ["Notes", counts.notes],
            ["Native annotations", counts.annotations],
            ["Collections", counts.collections],
            ["Attachments copied", counts.availableAttachments],
            ["Unavailable attachments", counts.missingAttachments],
            ["Verified payload files", counts.files],
          ]
        : plan
          ? [
              ["Sources", plan.sources],
              ["Notes", plan.notes],
              ["Native annotations", plan.annotations],
              ["Collections", plan.collections],
              ["Available attachments", plan.available],
              ["Unavailable attachments", plan.missing],
              ["URL-only links", plan.linkedURLs],
              ["File data to copy", bytes(plan.bytes)],
              ["Free disk space", plan.freeBytes < 0 ? "Unknown" : bytes(plan.freeBytes)],
            ]
          : [];
      el("plan").hidden = !rows.length;
      el("plan").replaceChildren();
      for (const [label, value] of rows) {
        const term = document.createElementNS("http://www.w3.org/1999/xhtml", "dt");
        term.textContent = label;
        const description = document.createElementNS("http://www.w3.org/1999/xhtml", "dd");
        description.textContent = typeof value === "number" ? value.toLocaleString() : value;
        el("plan").append(term, description);
      }
      const warnings = state.manifest?.warnings;
      el("warnings").hidden = !warnings?.length;
      if (warnings !== warningsRendered) {
        warningsRendered = warnings;
        el("warning-count").textContent =
          `${warnings?.length || 0} ${warnings?.length === 1 ? "warning" : "warnings"} — also saved in manifest.json`;
        el("warnings").open = !!warnings?.length;
        el("warning-list").replaceChildren();
        for (const warning of warnings || []) {
          el("warning-list").append(warningItem(warning));
        }
      }
    }
    const unsubscribe = controller.subscribe(render);
    function handle(fn) {
      return async () => {
        el("problem").hidden = true;
        try {
          await fn();
        } catch (error) {
          el("problem").textContent = String(error.message || error);
          el("problem").hidden = false;
        }
      };
    }
    el("choose").addEventListener(
      "click",
      handle(async () => {
        picking = true;
        render(controller.state);
        try {
          await actions.choose(window);
        } finally {
          picking = false;
          render(controller.state);
        }
      }),
    );
    el("start").addEventListener(
      "click",
      handle(() => controller.start()),
    );
    el("cancel").addEventListener("click", () => controller.cancel());
    el("reveal").addEventListener(
      "click",
      handle(() => actions.reveal()),
    );
    el("open-reader").addEventListener(
      "click",
      handle(() => {
        if (controller.state.phase === "complete") return actions.openImporter();
      }),
    );
    el("close").addEventListener("click", () => window.close());
    window.addEventListener("close", (event) => {
      if (controller.busy) {
        event.preventDefault();
        controller.cancel();
      }
    });
    window.addEventListener(
      "unload",
      () => {
        controller.cancel();
        unsubscribe();
        actions.detached();
      },
      { once: true },
    );
  },
  { once: true },
);
