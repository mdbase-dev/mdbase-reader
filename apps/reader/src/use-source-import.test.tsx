// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React effects */
import { act, useEffect } from "react";
import { expect, it, vi } from "vitest";

import { candidateProvenance } from "./new-citation-provenance.js";
import { partSource } from "./source-parts.fixtures.js";
import { createRoot } from "./testing/i18n.js";
import { useSourceImport } from "./use-source-import.js";

import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { CitationCandidate } from "@mdbase-reader/core";
import type { PickedFile } from "@mdbase-reader/platform";

const mocks = vi.hoisted(() => ({ suggestForFile: vi.fn() }));
vi.mock("./file-import-suggestion.js", () => ({ suggestForFile: mocks.suggestForFile }));
vi.mock("@mdbase-dev/ui/mark-activity", () => ({
  signalMdbaseMark: vi.fn(),
  trackMdbaseMarkProgress: () => ({
    update: vi.fn(),
    finish: vi.fn(),
    fail: vi.fn(),
    cancel: vi.fn(),
  }),
}));

it("stores an accepted local-file citation with its registry field provenance", async () => {
  const candidate: CitationCandidate = {
    citation: { id: "candidate", type: "article", title: "Registry title", DOI: "10.1234/work" },
    provenance: {
      provider: "DOI registry (doi.org)",
      query: "10.1234/work",
      retrievedAt: "2026-10-21T00:00:00Z",
    },
    warnings: [],
  };
  const provenance = candidateProvenance(candidate);
  mocks.suggestForFile.mockResolvedValue({ metadata: {}, citation: candidate, provenance });
  const saved = partSource("Registry title");
  const saveNewSourceCitation = vi.fn().mockResolvedValue(saved);
  const workspace = {
    importSourceFile: vi.fn().mockResolvedValue(saved),
    saveNewSourceCitation,
    importStatus: "idle",
    clearImportError: vi.fn(),
  } as unknown as ReaderWorkspaceController;
  const host = document.createElement("div");
  const root = createRoot(host);
  let flow: ReturnType<typeof useSourceImport>;
  function Harness(): React.JSX.Element {
    const current = useSourceImport(workspace, undefined, vi.fn());
    useEffect(() => {
      flow = current;
    }, [current]);
    return <div />;
  }
  const file: PickedFile = {
    name: "work.pdf",
    size: 0,
    mediaType: "application/pdf",
    bytes: new ArrayBuffer(0),
  };
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => flow.accept(file));
    await act(async () => {
      await vi.waitFor(() => expect(flow.suggestion?.citation).toEqual(candidate));
    });
    await act(async () => flow.importFile("Registry title", true));
    expect(saveNewSourceCitation).toHaveBeenCalledExactlyOnceWith(
      saved,
      {
        type: "article",
        title: "Registry title",
        DOI: "10.1234/work",
      },
      provenance,
    );
    expect(provenance["title"]).toEqual({ value: "Registry title", source: "registry:doi.org" });
    expect(provenance).not.toHaveProperty("id");
  } finally {
    await act(async () => root.unmount());
  }
});

it.each([false, true])(
  "retries a stopped import with a fresh signal (different file: %s)",
  async (differentFile) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.suggestForFile.mockResolvedValue({ metadata: {} });
    const importSourceFile = vi
      .fn()
      .mockImplementationOnce(
        (_request, options: { signal: AbortSignal }) =>
          new Promise((resolve) => {
            options.signal.addEventListener("abort", () => resolve(null), { once: true });
          }),
      )
      .mockResolvedValueOnce(partSource("Retry"));
    const workspace = {
      importSourceFile,
      importStatus: "idle",
      clearImportError: vi.fn(),
    } as unknown as ReaderWorkspaceController;
    const root = createRoot(document.createElement("div"));
    let flow: ReturnType<typeof useSourceImport>;
    function Harness(): React.JSX.Element {
      flow = useSourceImport(workspace, undefined, vi.fn());
      return <div />;
    }
    try {
      await act(async () => root.render(<Harness />));
      await act(async () =>
        flow.accept({
          name: "page.html",
          mediaType: "text/html",
          size: 0,
          bytes: new ArrayBuffer(0),
        }),
      );
      let pending: Promise<void>;
      await act(async () => {
        pending = flow.importFile("Retry");
      });
      await act(async () => {
        flow.cancel();
        await pending;
      });
      expect(flow!.stopped).toBe(true);
      if (differentFile) {
        await act(async () =>
          flow.accept({
            name: "another.html",
            mediaType: "text/html",
            size: 0,
            bytes: new ArrayBuffer(0),
          }),
        );
      }
      await act(async () => flow.importFile("Retry"));
      const stopped = importSourceFile.mock.calls[0]![1] as { signal: AbortSignal };
      const retried = importSourceFile.mock.calls[1]![1] as { signal: AbortSignal };
      expect(stopped.signal.aborted).toBe(true);
      expect(retried.signal.aborted).toBe(false);
      expect(retried.signal).not.toBe(stopped.signal);
      expect(retried).not.toHaveProperty("recoverExistingFiles");
      if (differentFile) {
        expect(importSourceFile.mock.calls[1]![0]).toMatchObject({
          name: "another.html",
        });
      }
      expect(flow!.stopped).toBe(false);
      expect(flow!.file).toBeNull();
    } finally {
      await act(async () => root.unmount());
    }
  },
);
