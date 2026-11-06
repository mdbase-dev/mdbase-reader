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
      reconcile,
    );
    return (
      <>
        <button onClick={() => status.change?.(source, "reading")}>Change</button>
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
      reconcile,
    );
    return (
      <>
        <button onClick={() => status.change?.(source, "reading")}>Change</button>
        {status.notice}
      </>
    );
  }
  root = createRoot(host);
  await act(async () => {
    root?.render(<Harness />);
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    host.querySelector("button")?.click();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(reconcile).not.toHaveBeenCalled();
  expect(host.textContent).toContain("write rejected");
  expect(host.textContent).not.toContain("Undo");
});

it("offers Undo before acknowledgement and serializes an early Undo after the first write", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const source = partSource("Attention");
  let acknowledge!: (value: typeof source) => void;
  const save = vi
    .fn()
    .mockReturnValueOnce(
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
    )
    .mockResolvedValue(source);
  const reconcile = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  function Harness(): React.JSX.Element {
    const status = useSourceStatus(
      { saveReadingStatus: save } as unknown as ReaderWorkspaceGateway,
      reconcile,
    );
    return (
      <>
        <button onClick={() => status.change?.(source, "reading")}>Change</button>
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
  expect(host.textContent).toContain("Reading");
  expect(reconcile).not.toHaveBeenCalled();
  const undo = [...host.querySelectorAll("button")].find((button) => button.textContent === "Undo");
  expect(undo).toBeDefined();
  await act(async () => {
    undo?.click();
    await Promise.resolve();
  });
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => {
    acknowledge(source);
    await Promise.resolve();
  });
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith(source.id, source.readingStatus ?? "inbox");
  expect(reconcile).toHaveBeenCalledExactlyOnceWith(source);
});

it.each(["acknowledged", "rejected", "deferred Undo", "submitted Undo"])(
  "keeps Finished newer than an earlier action that is %s",
  async (earlier) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const source = { ...partSource("Attention"), readingStatus: "queued" as const };
    const reading = { ...source, readingStatus: "reading" as const };
    const finished = { ...source, readingStatus: "finished" as const };
    let acknowledgeReading!: (value: typeof reading) => void;
    let refuseReading!: (reason: Error) => void;
    let acknowledgeUndo!: (value: typeof source) => void;
    const save = vi.fn((_id: string, status: string) => {
      if (status === "reading") {
        return new Promise((resolve, reject) => {
          acknowledgeReading = resolve;
          refuseReading = reject;
        });
      }
      if (status === "queued") {
        return new Promise((resolve) => {
          acknowledgeUndo = resolve;
        });
      }
      return Promise.resolve(finished);
    });
    const reconcile = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    function Harness(): React.JSX.Element {
      const status = useSourceStatus(
        { saveReadingStatus: save } as unknown as ReaderWorkspaceGateway,
        reconcile,
      );
      return (
        <>
          <button onClick={() => status.change?.(source, "reading")}>Read</button>
          <button onClick={() => status.change?.(source, "finished")}>Finish</button>
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
    if (earlier.includes("Undo")) {
      await act(async () => {
        [...host.querySelectorAll("button")]
          .find((button) => button.textContent === "Undo")
          ?.click();
        await Promise.resolve();
      });
    }
    if (earlier === "submitted Undo") {
      await act(async () => {
        acknowledgeReading(reading);
        await Promise.resolve();
      });
      expect(save).toHaveBeenLastCalledWith(source.id, "queued");
    }
    await act(async () => {
      host.querySelectorAll("button")[1]?.click();
      await Promise.resolve();
    });
    expect(reconcile).toHaveBeenCalledExactlyOnceWith(finished);
    if (earlier === "submitted Undo") {
      await act(async () => {
        acknowledgeUndo(source);
        await Promise.resolve();
      });
    } else if (earlier === "rejected") {
      await act(async () => {
        refuseReading(new Error("Old status refused"));
        await Promise.resolve();
      });
    } else {
      await act(async () => {
        acknowledgeReading(reading);
        await Promise.resolve();
      });
    }
    expect(save.mock.calls.map(([, status]) => status)).toEqual(
      earlier === "submitted Undo" ? ["reading", "queued", "finished"] : ["reading", "finished"],
    );
    expect(reconcile).toHaveBeenCalledExactlyOnceWith(finished);
    expect(host.textContent).toContain("Finished");
    expect(host.textContent).not.toContain("Old status refused");
  },
);
