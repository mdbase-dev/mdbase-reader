import { PdfTaskHelper } from "@embedpdf/models";
import { describe, expect, it, vi } from "vitest";

import { PdfSelectionWriter } from "./pdf-selection-writer.js";

import type { PdfTask } from "@embedpdf/models";
import type { SelectionDocumentState, SelectionRangeX } from "@embedpdf/plugin-selection";

const range = (index: number): SelectionRangeX => ({
  start: { page: 0, index: 0 },
  end: { page: 0, index },
});
function fixture(): {
  writer: PdfSelectionWriter;
  setSelection: ReturnType<typeof vi.fn>;
  external: (range: SelectionRangeX | null) => void;
  complete: () => void;
  current: () => SelectionRangeX | null;
  observed: ReturnType<PdfSelectionWriter["observe"]>[];
} {
  let current: SelectionRangeX | null = range(5);
  let complete = (): void => undefined;
  const observed: ReturnType<PdfSelectionWriter["observe"]>[] = [];
  const setSelection = vi.fn((next: SelectionRangeX | null) => {
    const task: PdfTask<void> = PdfTaskHelper.create();
    complete = () => {
      current = next;
      observed.push(writer.observe(next));
      task.resolve(undefined);
    };
    return task;
  });
  const writer = new PdfSelectionWriter({
    setSelection,
    getState: () => ({ selection: current }) as SelectionDocumentState,
  });
  return {
    writer,
    setSelection,
    observed,
    current: () => current,
    complete: () => complete(),
    external: (value) => {
      current = value;
      writer.observe(value);
    },
  };
}

async function settleMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("PDF selection writer", () => {
  it("serializes engine work and coalesces moves to the last range", async () => {
    const f = fixture();
    f.writer.queue(range(10));
    f.writer.queue(range(20));
    f.writer.queue(range(30));
    expect(f.setSelection).toHaveBeenCalledTimes(1);
    f.complete();
    await settleMicrotasks();
    expect(f.setSelection).toHaveBeenCalledTimes(2);
    expect(f.setSelection).toHaveBeenLastCalledWith(range(30));
    f.complete();
    await f.writer.settled();
    expect(f.current()).toEqual(range(30));
  });

  it("doesn't lose a final move arriving between flush completion and finalization", async () => {
    const f = fixture();
    f.writer.queue(range(10));
    const finished = vi.fn();
    const settled = f.writer.settled().then(finished);
    f.complete();
    await Promise.resolve();
    f.writer.queue(range(20));
    await settleMicrotasks();
    expect(f.setSelection).toHaveBeenLastCalledWith(range(20));
    expect(finished).not.toHaveBeenCalled();
    f.complete();
    await settled;
    expect(f.current()).toEqual(range(20));
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it("settles a failed write without an unhandled rejection and allows a later gesture", async () => {
    const f = fixture();
    f.setSelection.mockImplementationOnce(() => {
      throw new Error("Document closing");
    });
    f.writer.queue(range(10));
    await expect(f.writer.settled()).resolves.toBeUndefined();
    expect(f.current()).toEqual(range(5));
    f.writer.queue(range(20));
    f.complete();
    await f.writer.settled();
    expect(f.current()).toEqual(range(20));
  });

  it.each([null, range(3)])(
    "preserves an external change while geometry is loading (%j)",
    async (replacement) => {
      const f = fixture();
      f.writer.queue(range(10));
      f.writer.queue(range(20));
      f.external(replacement);
      f.complete();
      await settleMicrotasks();
      expect(f.observed).toEqual(["obsolete"]);
      expect(f.setSelection).toHaveBeenLastCalledWith(replacement);
      f.complete();
      await f.writer.settled();
      expect(f.current()).toEqual(replacement);
      expect(f.setSelection).toHaveBeenCalledTimes(2);
    },
  );

  it("doesn't overwrite a newer selection made after the old task's change event", async () => {
    const f = fixture();
    f.writer.queue(range(10));
    f.external(null);
    f.complete();
    f.external(range(3));
    await f.writer.settled();
    expect(f.setSelection).toHaveBeenCalledTimes(1);
    expect(f.current()).toEqual(range(3));
  });

  it("drops queued moves when unmounted", async () => {
    const f = fixture();
    f.writer.queue(range(10));
    f.writer.queue(range(20));
    f.writer.dispose();
    f.complete();
    await f.writer.settled();
    f.writer.queue(range(30));
    expect(f.setSelection).toHaveBeenCalledTimes(1);
  });
});
