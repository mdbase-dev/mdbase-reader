// @vitest-environment happy-dom
import { act } from "react";
import { expect, it, vi } from "vitest";

import { SourceImportDialog } from "./SourceImportDialog.js";
import { createRoot } from "./testing/i18n.js";

import type { SourceImportProgress } from "@mdbase-reader/core";

it("reads an HTML title on the first form render and focuses a plain unknown-outcome error", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const live = document.createElement("div");
  live.className = "dv-live-region";
  live.textContent = "Opening stale source";
  document.body.append(host, live);
  const root = createRoot(host);
  const file = {
    name: "download.html",
    mediaType: "text/html",
    size: 0,
    bytes: new TextEncoder().encode("<title>A title &amp; context</title><body>Text</body>").buffer,
  };
  const render = (error: string | null, uploading = false): void => {
    act(() =>
      root.render(
        <SourceImportDialog
          file={file}
          importing={false}
          progress={
            uploading
              ? { phase: "uploading", completedBytes: 1, totalBytes: 2, fileIndex: 1, fileCount: 1 }
              : null
          }
          error={error}
          onCancel={vi.fn()}
          onImport={vi.fn()}
        />,
      ),
    );
  };
  try {
    render(null);
    expect(host.querySelector<HTMLInputElement>("#reader-import-source-title")?.value).toBe(
      "A title & context",
    );
    render("upload receipt outcome_unknown");
    expect(document.activeElement).toBe(host.querySelector('[role="alert"]'));
    expect(host.querySelector('[role="alert"] > p')?.textContent).toContain(
      "Couldn’t confirm this file was added",
    );
    expect(host.querySelector('[role="alert"] details')?.textContent).toContain("outcome_unknown");
    expect(live.textContent).toBe("");
    expect(host.querySelector('[role="alert"]')?.textContent).not.toContain("Reconnect");
    render("the hosted boundary outcome is unknown", true);
    expect(host.querySelector('[role="alert"] > p')?.textContent).toContain(
      "Couldn’t confirm this file was added",
    );
    render("the live upload request changed", true);
    expect(host.querySelector('[role="alert"] > p')?.textContent).toContain(
      "This file wasn’t added",
    );
    expect(host.querySelector('[role="alert"] details')?.textContent).toContain(
      "ATTACHMENT_UPLOAD_SCOPE_CHANGED:",
    );
    expect(host.querySelector('[role="alert"] details')?.textContent).not.toContain(
      "the live upload request changed",
    );
  } finally {
    act(() => root.unmount());
    host.remove();
    live.remove();
    vi.unstubAllGlobals();
  }
});

it.each<[SourceImportProgress["phase"], boolean]>([
  ["checking", false],
  ["recovering", false],
  ["uploading", true],
  ["creating", true],
])("only reports transferred bytes during transfer or creation (%s)", (phase, transferred) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <SourceImportDialog
          file={{
            name: "[test] pending.html",
            mediaType: "text/html",
            size: 1,
            bytes: new ArrayBuffer(1),
          }}
          importing={true}
          progress={{ phase, completedBytes: 1, totalBytes: 1, fileIndex: 1, fileCount: 1 }}
          error={null}
          onCancel={vi.fn()}
          onImport={vi.fn()}
        />,
      ),
    );
    const summary = host.querySelector(".import-file-summary");
    expect(summary?.getAttribute("aria-busy")).toBe("true");
    expect(summary?.textContent.includes("Pending confirmation")).toBe(transferred);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it.each(["checking", "recovering", "uploading", "creating"] as const)(
  "names offline only when the file is known not to have been added (%s)",
  (phase) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() =>
        root.render(
          <SourceImportDialog
            file={{ name: "test.html", mediaType: "text/html", size: 1, bytes: new ArrayBuffer(1) }}
            importing={false}
            progress={{ phase, completedBytes: 0, totalBytes: 1, fileIndex: 1, fileCount: 1 }}
            error="engine failure"
            onCancel={vi.fn()}
            onImport={vi.fn()}
          />,
        ),
      );
      const message = host.querySelector('[role="alert"] > p')?.textContent;
      if (phase === "checking" || phase === "recovering") {
        expect(message).toBe(
          "You're offline. This file wasn't added. Try again when you're back online.",
        );
      } else {
        expect(message).toContain("Couldn’t confirm");
        expect(message).toContain("pending changes menu in the header");
      }
      expect(message).not.toContain("engine failure");
      expect(host.querySelector('[role="alert"] details')?.hasAttribute("open")).toBe(false);
    } finally {
      act(() => root.unmount());
      host.remove();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  },
);
