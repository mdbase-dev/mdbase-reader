// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React updates */
import { collectionId, sourceId } from "@mdbase-reader/core";
import { act, StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { confirmAnnotationDiscard } from "./annotation-draft-actions.js";
import { confirmCollectionSwitch } from "./collection-switching.js";
import { createConfirmationService, requestConfirmation } from "./confirmation.js";
import { ConfirmProvider, useConfirm } from "./ConfirmProvider.js";
import { createSourceWorkspaceLayout } from "./source-workspace-layout.js";
import { createRoot } from "./testing/i18n.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const options = {
  title: "Discard draft?",
  message: "This draft will be removed.",
  confirmLabel: "Discard draft",
  cancelLabel: "Keep editing",
  danger: true,
};
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = false;
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <StrictMode>
        <ConfirmProvider>
          <button>Opener</button>
        </ConfirmProvider>
      </StrictMode>,
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
function button(label: string): HTMLButtonElement {
  return [...host.querySelectorAll("button")].find((element) => element.textContent === label)!;
}
async function click(label: string): Promise<void> {
  await act(async () => button(label).click());
}

it("shows an accessible modal, defaults to the safe action and returns focus on accept/cancel", async () => {
  const opener = button("Opener");
  opener.focus();
  let result!: Promise<boolean>;
  act(() => {
    result = requestConfirmation(options);
  });
  const dialog = host.querySelector("dialog")!;
  expect(dialog.open).toBe(true);
  expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  expect(
    host.querySelector(`#${CSS.escape(dialog.getAttribute("aria-labelledby")!)}`)?.textContent,
  ).toBe(options.title);
  expect(
    host.querySelector(`#${CSS.escape(dialog.getAttribute("aria-describedby")!)}`)?.textContent,
  ).toBe(options.message);
  expect(document.activeElement).toBe(button("Keep editing"));
  const shortcut = vi.fn();
  window.addEventListener("keydown", shortcut);
  const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  button("Keep editing").dispatchEvent(escape);
  window.removeEventListener("keydown", shortcut);
  expect(shortcut).not.toHaveBeenCalled();
  expect(escape.defaultPrevented).toBe(false);
  expect(button("Discard draft").classList.contains("is-danger")).toBe(true);
  // A queued close event from StrictMode’s effect replay must not cancel a reopened modal.
  await act(async () => {
    dialog.dispatchEvent(new Event("close"));
  });
  expect(host.querySelector("dialog")?.open).toBe(true);
  await click("Discard draft");
  expect(await result).toBe(true);
  expect(document.activeElement).toBe(opener);
  act(() => {
    result = requestConfirmation(options);
  });
  await click("Keep editing");
  expect(await result).toBe(false);
  expect(document.activeElement).toBe(opener);
});

it("queues requests without replacing decisions and Escape cancels only the active request", async () => {
  let first!: Promise<boolean>, second!: Promise<boolean>;
  const next = vi.fn();
  act(() => {
    first = requestConfirmation(options);
    second = requestConfirmation({ ...options, title: "Close tab?", confirmLabel: "Close anyway" });
    void second.then(next);
  });
  await act(async () => {
    host.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true }));
  });
  expect(await first).toBe(false);
  expect(next).not.toHaveBeenCalled();
  expect(host.querySelector("h2")?.textContent).toBe("Close tab?");
  await click("Close anyway");
  expect(await second).toBe(true);
});

it("cancels all pending requests on unmount and fails closed without a host", async () => {
  let first!: Promise<boolean>, second!: Promise<boolean>;
  act(() => {
    first = requestConfirmation(options);
    second = requestConfirmation(options);
  });
  act(() => root.render(null));
  expect(await first).toBe(false);
  expect(await second).toBe(false);
  expect(await requestConfirmation(options)).toBe(false);
});

it("supports an isolated provider through useConfirm", async () => {
  const service = createConfirmationService();
  let confirm = service.confirm;
  function Harness(): null {
    confirm = useConfirm();
    return null;
  }
  act(() =>
    root.render(
      <ConfirmProvider service={service}>
        <Harness />
      </ConfirmProvider>,
    ),
  );
  let result!: Promise<boolean>;
  act(() => {
    result = confirm(options);
  });
  await click("Keep editing");
  expect(await result).toBe(false);
});

it("routes annotation discard through the modal and waits for an explicit decision", async () => {
  const discarded = vi.fn();
  let result!: Promise<boolean>;
  act(() => {
    result = confirmAnnotationDiscard("Discard this unfinished annotation comment?");
    void result.then((accepted) => {
      if (accepted) {
        discarded();
      }
    });
  });
  expect(discarded).not.toHaveBeenCalled();
  await click("Keep editing");
  expect(await result).toBe(false);
  expect(discarded).not.toHaveBeenCalled();
  act(() => {
    result = confirmAnnotationDiscard("Discard this unfinished annotation comment?");
  });
  await click("Discard draft");
  expect(await result).toBe(true);
});

it("waits before switching dirty collections and describes device-local drafts truthfully", async () => {
  const source = { id: sourceId("source"), collectionId: collectionId("collection") };
  const initial = createSourceWorkspaceLayout(source.id);
  const layout = {
    ...initial,
    panes: initial.panes.map((pane) => ({
      ...pane,
      tabs: pane.tabs.map((tab) => ({ ...tab, dirty: true })),
    })),
  };
  let result!: Promise<boolean>;
  act(() => {
    result = confirmCollectionSwitch(layout, [source]);
  });
  expect(host.querySelector("p")?.textContent).toContain("Drafts are local to this device");
  expect(host.textContent).not.toContain("Save your edits first");
  await click("Stay");
  expect(await result).toBe(false);
  act(() => {
    result = confirmCollectionSwitch(layout, [source]);
  });
  await click("Switch anyway");
  expect(await result).toBe(true);
});
