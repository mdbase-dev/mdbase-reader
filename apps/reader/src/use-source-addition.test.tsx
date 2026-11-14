// @vitest-environment happy-dom
import { act } from "react";
import { expect, it, vi } from "vitest";

import { ReaderMdbaseContext } from "./reader-collections.js";
import { createRoot } from "./testing/i18n.js";
import { useSourceAddition } from "./use-source-addition.js";

import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { Mdbase } from "@mdbase-reader/connect/native";
import type { JSX } from "react";

const mocks = vi.hoisted(() => ({ clearFile: vi.fn(), clearWeb: vi.fn(), importFile: vi.fn() }));
vi.mock("./use-source-import.js", () => ({
  useSourceImport: () => ({ clearError: mocks.clearFile, importFile: mocks.importFile }),
}));
vi.mock("./use-web-capture.js", () => ({
  useWebCapture: () => ({ clearError: mocks.clearWeb }),
}));

it("clears offline addition errors on reconnect even while existing writes are syncing", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let changed: () => void = () => undefined;
  let snapshot = {
    phase: { kind: "ready" },
    sync: {
      state: "offline",
      attention: [],
      incidents: [],
      writes: { pending: [{}], rejected: [], saveState: "saving" },
    },
  };
  const mdbase = {
    subscribe: (listener: () => undefined) => {
      changed = listener;
      return () => undefined;
    },
    getSnapshot: () => snapshot,
  } as unknown as Mdbase;
  const workspace = { library: { status: "loading" } } as unknown as ReaderWorkspaceController;
  let addition: ReturnType<typeof useSourceAddition>;
  function Harness(): JSX.Element {
    addition = useSourceAddition(workspace, undefined, vi.fn());
    return <output>{addition.error}</output>;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <ReaderMdbaseContext value={mdbase}>
          <Harness />
        </ReaderMdbaseContext>,
      ),
    );
    await act(async () => addition.addFile(new File(["bad"], "[test] unsupported.exe")));
    expect(host.textContent).toContain("isn’t a PDF");
    snapshot = { ...snapshot, sync: { ...snapshot.sync, state: "saving" } };
    act(() => {
      changed();
    });
    expect(host.textContent).toBe("");
    expect(mocks.clearFile).toHaveBeenCalledOnce();
    expect(mocks.clearWeb).toHaveBeenCalledOnce();
    expect(mocks.importFile).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
