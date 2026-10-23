// @vitest-environment happy-dom
import { collectionId, fileId, fileRevision, sourceId } from "@mdbase-reader/core";
import { createEventEmitter } from "@mdbase-reader/reading-surface";
import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LibraryTextSearch } from "./LibraryTextSearch.js";
import { SearchPassageStatus } from "./SearchPassageStatus.js";
import {
  navigateToSearchDestination,
  searchPassageFallback,
  useSearchNavigation,
} from "./use-search-navigation.js";

import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { SearchDestination, SourceSummary } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true });

const target = {
  fileId: fileId("html"),
  file: "page.html",
  revision: fileRevision(`sha256:${"a".repeat(64)}`),
};
const source: SourceSummary = {
  id: sourceId("source"),
  collectionId: collectionId("collection"),
  path: "source.md",
  title: "A source",
  creators: [],
  tags: [],
  documents: [{ ...target, mediaType: "text/html", role: "primary" }],
};
const destination: SearchDestination = {
  document: target,
  location: { kind: "html" },
  quote: { exact: "Matching passage" },
};
const surface = (found: boolean): ReadingSurface => ({
  kind: "html",
  document: { document: target, mediaType: "text/html", url: "page" },
  capabilities: {
    textExtraction: {
      extractText: () => Promise.resolve("Matching passage in the document"),
      extractSearchSegments: () =>
        Promise.resolve([{ location: { kind: "html" }, text: "Matching passage in the document" }]),
    },
    searchNavigation: { goToDestination: vi.fn().mockResolvedValue(found), clear: vi.fn() },
  },
  locations: createEventEmitter(),
  currentLocation: () => null,
  goTo: () => Promise.resolve(true),
  destroy: () => Promise.resolve(),
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("search destination navigation", () => {
  it("restores the usual position if the renderer fails after starting navigation", async () => {
    const reading = surface(false);
    const previous = { kind: "html" as const, href: "page", progression: 0.7 };
    const goTo = vi.fn().mockResolvedValue(true);
    const broken = {
      ...reading,
      currentLocation: () => previous,
      goTo,
      capabilities: {
        searchNavigation: {
          clear: vi.fn(),
          goToDestination: vi.fn().mockRejectedValue(new Error("Native navigation failed")),
        },
      },
    };
    expect(await navigateToSearchDestination(broken, destination)).toBe(false);
    expect(goTo).toHaveBeenCalledWith(previous);
  });
});

describe("document search UI", () => {
  it("passes exact-revision destination evidence when activating the result button", async () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <LibraryTextSearch
          scope="documents"
          query="matching passage"
          sources={[source]}
          gateway={{} as ReaderWorkspaceGateway}
          surfaces={new Map([["session", surface(true)]])}
          onOpen={onOpen}
        />,
      ),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    const button = host.querySelector<HTMLButtonElement>("li button")!;
    expect(button).not.toBeNull();
    expect(button.textContent).toContain("Matching passage");
    act(() => {
      button.focus();
      button.click();
    });
    expect(onOpen).toHaveBeenCalledWith(
      source.id,
      "document",
      expect.objectContaining({
        document: target,
        location: { kind: "html" },
        quote: expect.objectContaining({ exact: "Matching passage" }),
      }),
    );
    act(() => root.unmount());
  });

  it.each([
    { found: true, stale: false },
    { found: false, stale: false },
    { found: false, stale: true },
  ])(
    "announces and focuses the match status, or honest fallback ($found, stale=$stale)",
    async ({ found, stale }) => {
      vi.useFakeTimers();
      const active = { kind: "source", view: "document", sourceId: source.id, id: "session" };
      const workspace = {
        activeTab: active,
        layout: {
          focusedPaneId: "pane",
          panes: [{ id: "pane", activeTabId: "session", tabs: [active] }],
        },
        activateTab: vi.fn(),
        focus: vi.fn(),
        openView: vi.fn(),
      } as unknown as SourceWorkspaceController;
      const reading = surface(found);
      const requested = stale
        ? {
            ...destination,
            document: {
              ...target,
              revision: fileRevision(`sha256:${"b".repeat(64)}`),
            },
          }
        : destination;
      const surfaces = new Map([["session", reading]]);
      function Harness(): React.JSX.Element {
        const navigation = useSearchNavigation(workspace, surfaces);
        const request = useRef(requested);
        return (
          <>
            <button onClick={() => navigation.open(source.id, "document", request.current)}>
              Open result
            </button>
            <SearchPassageStatus message={navigation.message} />
          </>
        );
      }
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      act(() => root.render(<Harness />));
      act(() => {
        host.querySelector("button")!.click();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      const status = host.querySelector('[role="status"]')!;
      expect(status.textContent).toBe(
        found
          ? "Matching passage: “Matching passage”. Temporarily highlighted in the document."
          : searchPassageFallback,
      );
      expect(document.activeElement).toBe(status);
      if (stale) {
        expect(reading.capabilities.searchNavigation?.goToDestination).not.toHaveBeenCalled();
      } else {
        expect(reading.capabilities.searchNavigation?.goToDestination).toHaveBeenCalledWith(
          destination,
        );
      }
      if (found) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(12_000);
        });
        expect(reading.capabilities.searchNavigation?.clear).toHaveBeenCalled();
      }
      act(() => root.unmount());
    },
  );
});
