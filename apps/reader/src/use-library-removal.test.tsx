// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { partSource } from "./source-parts.fixtures.js";
import { createRoot } from "./testing/i18n.js";
import { useLibrarySelection, type LibrarySelectionState } from "./use-library-selection.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";

let root: ReturnType<typeof createRoot>;
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it("removes a row before acknowledgement and restores it when deletion is refused", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const source = partSource("Owned source");
  let refuse!: (reason: Error) => void;
  const gateway = {
    library: vi.fn().mockResolvedValue({
      collectionName: "Reading",
      connectionState: "connected",
      sources: [source],
    }),
    planSourceRemoval: vi.fn(),
    removeSource: vi.fn().mockReturnValue(
      new Promise<void>((_resolve, reject) => {
        refuse = reject;
      }),
    ),
  } as unknown as ReaderWorkspaceGateway;
  let selection!: LibrarySelectionState;
  function Harness(): null {
    selection = useLibrarySelection(gateway);
    return null;
  }
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<Harness />);
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(selection.library).toMatchObject({ status: "ready", value: { sources: [source] } });
  let removing!: Promise<void>;
  await act(async () => {
    removing = selection.removeSource!({
      sourceId: source.id,
      path: source.path,
      expectedRevision: source.recordRevision,
      brokenLinkPaths: [],
    });
    void removing.catch(() => undefined);
    await Promise.resolve();
  });
  expect(selection.library).toMatchObject({ status: "ready", value: { sources: [] } });
  await act(async () => {
    refuse(new Error("Removal refused"));
    await expect(removing).rejects.toThrow("Removal refused");
  });
  expect(selection.library).toMatchObject({ status: "ready", value: { sources: [source] } });
});
