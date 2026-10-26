// @vitest-environment happy-dom
import { collectionId, fileId, fileRevision, sourceId } from "@mdbase-reader/core";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LibraryDocumentIndex, useLibraryDocumentIndex } from "./LibraryDocumentIndex.js";
import { createRoot } from "./testing/i18n.js";

import type { ReaderLibrarySnapshot, ReaderWorkspaceGateway } from "./workspace-model.js";

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  put: vi.fn(() => Promise.reject(new DOMException("Full", "QuotaExceededError"))),
  dispose: vi.fn(),
}));
vi.mock("./library-text-client.js", () => ({
  LibraryTextClient: class {
    close = mocks.close;
    put = mocks.put;
    open = (): Promise<void> => Promise.resolve();
    reconcile = (): Promise<string[]> => Promise.resolve([]);
  },
}));
vi.mock("./library-index-idle.js", () => ({
  LibraryIndexIdle: class {
    wait = (): Promise<void> => Promise.resolve();
    dispose = mocks.dispose;
  },
}));
vi.mock("./document-text-extraction.js", () => ({
  archivedHtmlTextExtractor: (): Promise<() => string> => Promise.resolve(() => "page text"),
}));

function Status(): React.JSX.Element {
  const index = useLibraryDocumentIndex();
  return <p role="status">{index.status}</p>;
}
const library: ReaderLibrarySnapshot = {
  collectionName: "Test",
  connectionState: "connected",
  sources: [
    {
      collectionId: collectionId("test"),
      id: sourceId("source"),
      path: "source.md",
      title: "Source",
      creators: [],
      tags: [],
      documents: [
        {
          fileId: fileId("file"),
          file: "page.html",
          revision: fileRevision(`sha256:${"a".repeat(64)}`),
          mediaType: "text/html",
          role: "primary",
        },
      ],
    },
  ],
};

describe("collection index ownership", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("degrades quietly to loaded-document search on quota failure and closes the worker", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div");
    const root = createRoot(host);
    const readFile = vi.fn(() =>
      Promise.resolve({
        path: "page.html",
        mediaType: "text/html",
        bytes: new Uint8Array(),
      }),
    );
    await act(async () => {
      root.render(
        <LibraryDocumentIndex
          library={library}
          gateway={{ readFile } as unknown as ReaderWorkspaceGateway}
        >
          <Status />
        </LibraryDocumentIndex>,
      );
      await Promise.resolve();
    });
    expect(host.textContent).toContain(
      "Library index unavailable; searching loaded documents only.",
    );
    expect(mocks.put).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalled();
    await act(() => Promise.resolve(root.unmount()));
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });
});
