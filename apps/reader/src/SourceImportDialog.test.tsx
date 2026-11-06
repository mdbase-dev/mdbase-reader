// @vitest-environment happy-dom
import { act } from "react";
import { expect, it, vi } from "vitest";

import { SourceImportDialog } from "./SourceImportDialog.js";
import { createRoot } from "./testing/i18n.js";

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
  const render = (error: string | null): void => {
    act(() =>
      root.render(
        <SourceImportDialog
          file={file}
          importing={false}
          progress={null}
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
  } finally {
    act(() => root.unmount());
    host.remove();
    live.remove();
    vi.unstubAllGlobals();
  }
});
