// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes queued React effects */
import { act, useRef, type JSX } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LibraryViewSaveDialog } from "./LibraryViewSaveDialog.js";
import { ModalDialog } from "./ModalDialog.js";
import { SourceImportDialog } from "./SourceImportDialog.js";
import { createRoot } from "./testing/i18n.js";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let opener: HTMLButtonElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  opener = document.createElement("button");
  document.body.append(opener, host);
  opener.focus();
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  opener.remove();
});

function Harness({ dismiss }: { readonly dismiss: () => void }): JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  return (
    <ModalDialog
      className="test-dialog"
      labelledBy="title"
      initialFocus={input}
      onDismiss={dismiss}
    >
      <h2 id="title">A modal task</h2>
      <input ref={input} />
      <button type="button">Another control</button>
    </ModalDialog>
  );
}

async function dismissDialog(): Promise<void> {
  const dialog = host.querySelector("dialog")!;
  await act(async () => {
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    dialog.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: -1 }));
  });
}

describe("native modal dialogs", () => {
  it("opens modally, labels the dialog, takes focus once and returns it on close", async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    const dismiss = vi.fn();
    await act(async () => root.render(<Harness dismiss={dismiss} />));
    const dialog = host.querySelector("dialog")!;
    expect(showModal).toHaveBeenCalledOnce();
    showModal.mockRestore();
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute("aria-labelledby")).toBe("title");
    expect(document.activeElement).toBe(host.querySelector("input"));
    host.querySelector("button")?.focus();
    await act(async () => root.render(<Harness dismiss={() => undefined} />));
    expect(document.activeElement).toBe(host.querySelector("button"));
    await act(async () => root.render(null));
    expect(document.activeElement).toBe(opener);
  });

  it("routes cancel and backdrop through dismissal without closing when the caller refuses", async () => {
    const dismiss = vi.fn();
    await act(async () => root.render(<Harness dismiss={dismiss} />));
    const dialog = host.querySelector("dialog")!;
    await dismissDialog();
    expect(dismiss).toHaveBeenCalledTimes(2);
    expect(dialog.open).toBe(true);
    await act(async () => {
      host.querySelector("input")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      // A click on the dialog's own padding is not a backdrop click.
      dialog.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(dismiss).toHaveBeenCalledTimes(2);
  });

  it("reopens when the browser force-closes a refused dialog", async () => {
    await act(async () => root.render(<Harness dismiss={vi.fn()} />));
    const dialog = host.querySelector("dialog")!;
    await act(async () => {
      dialog.close();
      dialog.dispatchEvent(new Event("close"));
    });
    expect(dialog.open).toBe(true);
  });

  it("keeps keys inside the modal from reaching app shortcuts", async () => {
    const shortcut = vi.fn();
    document.addEventListener("keydown", shortcut);
    await act(async () => root.render(<Harness dismiss={vi.fn()} />));
    host
      .querySelector("input")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    document.removeEventListener("keydown", shortcut);
    expect(shortcut).not.toHaveBeenCalled();
  });

  it("does not restore focus to a removed opener", async () => {
    await act(async () => root.render(<Harness dismiss={vi.fn()} />));
    opener.remove();
    const focus = vi.spyOn(opener, "focus");
    await act(async () => root.render(null));
    expect(focus).not.toHaveBeenCalled();
  });
});

describe("migrated modal tasks", () => {
  it("protects a finalizing file import but allows dismissal before the write", async () => {
    const onCancel = vi.fn();
    const props = {
      file: { name: "paper.pdf", mediaType: "application/pdf", size: 0, bytes: new ArrayBuffer(0) },
      importing: true,
      error: null,
      onCancel,
      onImport: vi.fn(),
    };
    await act(async () =>
      root.render(
        <SourceImportDialog
          {...props}
          progress={{
            phase: "creating",
            completedBytes: 0,
            totalBytes: 0,
            fileIndex: 1,
            fileCount: 1,
          }}
        />,
      ),
    );
    expect(document.activeElement?.tagName).not.toBe("BODY");
    await dismissDialog();
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => root.render(<SourceImportDialog {...props} progress={null} />));
    await dismissDialog();
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("keeps the save form inside a labelled modal and refuses dismissal and duplicate submits while saving", async () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    const props = { description: "Save these filters", placeholder: "My view", onCancel, onSave };
    await act(async () => root.render(<LibraryViewSaveDialog {...props} saving={false} />));
    const input = host.querySelector("input")!;
    expect(document.activeElement).toBe(input);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input,
        " Notes ",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
      host
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    // Submit after React has applied the edit.
    await act(async () =>
      host
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(onSave).toHaveBeenCalledWith("Notes");
    await act(async () => root.render(<LibraryViewSaveDialog {...props} saving />));
    onSave.mockClear();
    await dismissDialog();
    await act(async () =>
      host
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(host.querySelector('[role="button"]')).toBeNull();
  });
});
