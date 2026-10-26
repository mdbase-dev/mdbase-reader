// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes queued React effects */
import { act, useEffect, type JSX } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { partSource } from "./source-parts.fixtures.js";
import { SourceAddDialog } from "./SourceAddDialog.js";
import { createRoot } from "./testing/i18n.js";
import { useWebCapture, type WebCaptureFlow } from "./use-web-capture.js";

import type { SourceAdditionServices } from "./source-addition-flow.js";
import type { ReaderWorkspaceController } from "./use-reader-workspace.js";

const mocks = vi.hoisted(() => ({
  capture: vi.fn<SourceAdditionServices["capture"]>(),
  lookUp: vi.fn<SourceAdditionServices["lookUp"]>(),
  pdfIdentifiers: vi.fn<SourceAdditionServices["pdfIdentifiers"]>(),
  candidates: vi.fn<NonNullable<SourceAdditionServices["candidates"]>>(),
  services: vi.fn(),
}));
vi.mock("./source-addition-services.js", () => ({
  readerSourceAdditionServices: (input: SourceAdditionServices): SourceAdditionServices => {
    mocks.services(input);
    return { ...input, ...mocks };
  },
}));

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const candidate = {
  citation: { id: "candidate", type: "book", title: "A book", ISBN: "9780140449136" },
  provenance: {
    provider: "isbn",
    query: "isbn:9780140449136",
    retrievedAt: "2026-01-01T00:00:00Z",
  },
  warnings: [],
};
const source = { ...partSource("saved") };
delete source.citation;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let flow: WebCaptureFlow;
let pending: Promise<void>;
const onImported = vi.fn();
const onClose = vi.fn();
const createSource = vi.fn();
const importSourceFile = vi.fn();
const saveNewSourceCitation = vi.fn();
const workspace = {
  importError: null,
  createSource,
  importSourceFile,
  saveNewSourceCitation,
} as unknown as ReaderWorkspaceController;

function Harness(): JSX.Element {
  const capture = useWebCapture(workspace, onImported);
  useEffect(() => {
    flow = capture;
  });
  return (
    <SourceAddDialog
      open
      busy={capture.status === "capturing"}
      error={capture.error}
      canChooseFile
      onClose={onClose}
      onChooseFile={vi.fn()}
      onCapture={(input) => {
        pending = flow.capture(input);
      }}
      onEdit={capture.clearError}
      onDropFile={vi.fn()}
      lookup={capture}
    />
  );
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.capture.mockReset();
  mocks.lookUp.mockReset().mockResolvedValue(candidate);
  mocks.pdfIdentifiers.mockReset().mockResolvedValue({});
  mocks.candidates.mockReset().mockResolvedValue({ pdfUrls: [], landingPages: [] });
  createSource.mockReset().mockResolvedValue(source);
  importSourceFile.mockReset().mockResolvedValue(source);
  saveNewSourceCitation.mockReset().mockResolvedValue(source);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function type(value: string): Promise<void> {
  const input = host.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function start(value: string): Promise<void> {
  await type(value);
  await act(async () => {
    host
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(mocks.services).toHaveBeenCalled());
  });
}
function button(name: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll("button")].find((item) => item.textContent === name);
}
async function dismiss(): Promise<void> {
  await act(async () => {
    const dialog = host.querySelector("dialog")!;
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    dialog.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: -1 }));
  });
}

describe("cancellable source addition", () => {
  it("keeps a typed link on Escape/backdrop and only dismisses an empty add dialog", async () => {
    await type("https://example.com/article");
    await dismiss();
    expect(onClose).not.toHaveBeenCalled();
    expect(host.querySelector("input")?.value).toBe("https://example.com/article");
    await type("");
    await dismiss();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("aborts an in-flight capture, keeps the input editable, and writes nothing", async () => {
    mocks.capture.mockImplementation(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("Cancelled")), { once: true });
        }),
    );
    await start("https://example.com/article");
    const signal = mocks.capture.mock.calls[0]?.[1].signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    await dismiss();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      button("Stop adding")?.click();
      await pending;
    });
    expect(signal?.aborted).toBe(true);
    expect(flow.status).toBe("idle");
    expect(flow.error).toBeNull();
    expect(host.querySelector("input")?.disabled).toBe(false);
    expect(host.querySelector("input")?.value).toBe("https://example.com/article");
    expect(createSource).not.toHaveBeenCalled();
    expect(importSourceFile).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
  });

  it("ignores a cancelled lookup that resolves late, including after a retry", async () => {
    const lookup = deferred<typeof candidate>();
    mocks.lookUp.mockReturnValueOnce(lookup.promise);
    await start("9780140449136");
    const cancelled = pending;
    const signal = (mocks.services.mock.calls[0]?.[0] as SourceAdditionServices).signal;
    await act(async () => button("Stop adding")?.click());
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      pending = flow.capture("9780140449136");
      await pending;
    });
    expect(onImported).toHaveBeenCalledExactlyOnceWith(source.id);
    await act(async () => {
      lookup.resolve(candidate);
      await cancelled;
    });
    expect(createSource).toHaveBeenCalledOnce();
    expect(importSourceFile).not.toHaveBeenCalled();
    expect(flow.error).toBeNull();
    expect(onImported).toHaveBeenCalledOnce();
  });

  it("finishes a source and its citation once the write starts, rather than aborting mid-write", async () => {
    const write = deferred<typeof source>();
    createSource.mockReturnValue(write.promise);
    await start("9780140449136");
    await act(async () => {
      await vi.waitFor(() => expect(createSource).toHaveBeenCalled());
    });
    const signal = (mocks.services.mock.calls[0]?.[0] as SourceAdditionServices).signal;
    expect(flow.canCancel).toBe(false);
    expect(button("Finishing adding…")?.disabled).toBe(true);
    await act(async () => flow.cancel());
    await dismiss();
    expect(signal?.aborted).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      write.resolve(source);
      await pending;
    });
    expect(saveNewSourceCitation).toHaveBeenCalledOnce();
    expect(onImported).toHaveBeenCalledExactlyOnceWith(source.id);
    expect(flow.status).toBe("idle");
  });

  it("reports the saved source if citation saving fails after the write boundary", async () => {
    saveNewSourceCitation.mockRejectedValueOnce(new Error("Citation unavailable"));
    await start("9780140449136");
    await act(async () => pending);
    expect(flow.notice?.sourceId).toBe(source.id);
    expect(flow.notice?.detail).toBe("Citation unavailable");
    expect(onImported).not.toHaveBeenCalled();
    await act(async () => flow.openNoticed());
    expect(onImported).toHaveBeenCalledExactlyOnceWith(source.id);
  });
});
