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

    function render(state) {
      const busy = controller.busy;
      el("status").textContent = state.message;
      el("destination").textContent =
        state.destination ||
        state.parent ||
        "A new, uniquely named folder will be created inside it. Existing folders are never overwritten.";
      el("choose").disabled = busy || picking;
      el("start").disabled = state.phase !== "ready" || picking;
      el("cancel").hidden = !busy;
      el("cancel").disabled = state.phase === "cancelling";
      el("close").disabled = busy;
      el("reveal").hidden = state.phase !== "complete";
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
      if (warnings && warnings !== warningsRendered) {
        warningsRendered = warnings;
        el("warning-count").textContent =
          `${warnings.length} warnings — also saved in manifest.json`;
        el("warning-list").replaceChildren();
        for (const w of warnings) {
          const item = document.createElementNS("http://www.w3.org/1999/xhtml", "li");
          item.textContent = `${w.code}: ${w.key}${w.parent ? ` (parent ${w.parent})` : ""}`;
          el("warning-list").append(item);
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
