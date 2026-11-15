// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { partSource } from "./source-parts.fixtures.js";
import { createRoot } from "./testing/i18n.js";
import { useDocumentAttachment } from "./use-document-attachment.js";
import { DocumentEmpty } from "./WorkspacePaneSupport.js";

import type { findOpenAccessPdf } from "./open-access-pdf.js";

const mocks = vi.hoisted(() => ({ find: vi.fn<typeof findOpenAccessPdf>() }));
vi.mock("./open-access-pdf.js", () => ({
  findOpenAccessPdf: mocks.find,
  pdfFileName: () => "paper.pdf",
}));
vi.mock("./web-capture-client.js", () => ({ fetchCapture: vi.fn() }));

const source = {
  ...partSource("paper"),
  documents: [],
  citation: { id: "paper", type: "article-journal", DOI: "10.1000/fixture" },
};
const attachSourceFile = vi.fn();
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function Harness(): React.JSX.Element {
  const attachment = useDocumentAttachment({ attachSourceFile }, undefined);
  return <DocumentEmpty source={source} attachment={attachment} onOpenNote={vi.fn()} />;
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
    "Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0",
  );
  mocks.find.mockReset().mockResolvedValue(null);
  attachSourceFile.mockReset().mockResolvedValue(source);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

async function findPdf(): Promise<void> {
  await act(async () => {
    const find = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Find an open-access PDF",
    );
    find!.click();
    await vi.waitFor(() => expect(mocks.find).toHaveBeenCalled());
  });
  await act(async () => {
    await vi.waitFor(() => expect(host.querySelector("[role=status]")).toBeNull());
  });
}

describe("PDF attachment extension guidance", () => {
  it("offers the extension after no open-access PDF is found and clears the hint on success", async () => {
    await findPdf();
    const alert = host.querySelector("[role=alert]");
    expect(alert?.textContent).toContain("Attach a copy you have");
    expect(alert?.querySelector("a")?.textContent).toBe("Get Chrome extension");
    expect(attachSourceFile).not.toHaveBeenCalled();
    mocks.find.mockResolvedValueOnce({
      kind: "pdf",
      bytes: new Uint8Array(4),
      submittedUrl: "https://example.com/paper.pdf",
      canonicalUrl: "https://example.com/paper.pdf",
      retrievedAt: "2026-11-15T00:00:00Z",
    });
    await findPdf();
    expect(attachSourceFile).toHaveBeenCalledOnce();
    expect(host.querySelector("[role=alert]")).toBeNull();
    expect(host.querySelector("a")).toBeNull();
  });

  it("does not suggest installation for unrelated PDF lookup failures", async () => {
    mocks.find.mockRejectedValueOnce(new Error("Lookup unavailable"));
    await findPdf();
    expect(host.querySelector("[role=alert]")?.textContent).toBe("Lookup unavailable");
    expect(host.querySelector("a")).toBeNull();
    expect(attachSourceFile).not.toHaveBeenCalled();
  });
});
