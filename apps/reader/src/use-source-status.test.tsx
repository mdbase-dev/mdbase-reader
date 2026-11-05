// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { partSource } from "./source-parts.fixtures.js";
import { createRoot } from "./testing/i18n.js";
import { useSourceStatus } from "./use-source-status.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { SourceSummary } from "@mdbase-reader/core";

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it("restores the previous status through the same write and routes Ctrl+Z only outside typing", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const source: SourceSummary = { ...partSource("Attention"), readingStatus: "queued" };
  const save = vi.fn().mockResolvedValue(source);
  const reconcile = vi.fn();
  const host = document.createElement("div");
  const notices = document.createElement("div");
  notices.id = "reader-notices";
  document.body.append(host, notices);
  function Harness(): React.JSX.Element {
    const status = useSourceStatus(
      { saveReadingStatus: save } as unknown as ReaderWorkspaceGateway,
      [source],
      reconcile,
    );
    return (
      <>
        <button onClick={() => status.change?.(source.id, "reading")}>Change</button>
        <input aria-label="Draft" />
        {status.notice}
      </>
    );
  }
  root = createRoot(host);
  await act(async () => {
    root?.render(<Harness />);
    await Promise.resolve();
  });
  await act(async () => {
    host.querySelector("button")?.click();
    await Promise.resolve();
  });
  expect(save).toHaveBeenCalledWith(source.id, "reading");
  expect(notices.textContent).toContain("Reading");
  const key = (): KeyboardEvent =>
    new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true });
  host.querySelector("input")?.dispatchEvent(key());
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => {
    document.body.dispatchEvent(key());
    await Promise.resolve();
  });
  expect(save).toHaveBeenLastCalledWith(source.id, "queued");
  expect(reconcile).toHaveBeenCalledTimes(2);
  expect(notices.textContent).toContain("Restored the status");
});

it("does not claim success or offer Undo after a rejected status write", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const source = partSource("Attention");
  const save = vi.fn().mockRejectedValue(new Error("write rejected"));
  const reconcile = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  function Harness(): React.JSX.Element {
    const status = useSourceStatus(
      { saveReadingStatus: save } as unknown as ReaderWorkspaceGateway,
      [source],
      reconcile,
    );
    return (
      <>
        <button onClick={() => status.change?.(source.id, "reading")}>Change</button>
        {status.notice}
      </>
    );
  }
  root = createRoot(host);
  await act(async () => {
    root?.render(<Harness />);
    await Promise.resolve();
  });
  await act(async () => {
    host.querySelector("button")?.click();
    await Promise.resolve();
  });
  expect(reconcile).not.toHaveBeenCalled();
  expect(host.textContent).toContain("write rejected");
  expect(host.textContent).not.toContain("Undo");
});
