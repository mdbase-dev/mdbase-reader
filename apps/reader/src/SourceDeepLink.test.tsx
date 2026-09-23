// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { sourceId, type SourceSummary } from "@mdbase-reader/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

import { requestedSourceId, SourceDeepLink } from "./SourceDeepLink.js";

it("only resolves the source parameter for the requested collection", () => {
  const url = "https://reader.example/?collection=c1&source=s1";
  expect(requestedSourceId(url, "c1")).toBe("s1");
  expect(requestedSourceId(url, "c2")).toBeNull();
  expect(requestedSourceId("https://reader.example/?source=s1", "c1")).toBeNull();
});
it("waits for streamed sources, opens exactly once, and does not reopen after rerenders", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  const open = vi.fn();
  const library = {
    collectionName: "[test] Library",
    connectionState: "connected" as const,
    sources: [] as SourceSummary[],
    sourceIndex: { complete: false, loaded: 0 },
  };
  try {
    await act(async () => {
      root.render(<SourceDeepLink id="s1" library={library} open={open} />);
    });
    expect(open).not.toHaveBeenCalled();
    expect(host.textContent).toBe("");
    library.sources.push({ id: sourceId("s1") } as SourceSummary);
    await act(async () => {
      root.render(<SourceDeepLink id="s1" library={{ ...library }} open={open} />);
    });
    await act(async () => {
      root.render(<SourceDeepLink id="s1" library={{ ...library }} open={open} />);
    });
    expect(open).toHaveBeenCalledExactlyOnceWith("s1");
    await act(async () => {
      root.render(
        <SourceDeepLink
          id="missing"
          library={{ ...library, sourceIndex: { complete: true, loaded: 1 } }}
          open={open}
        />,
      );
    });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("not available");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
