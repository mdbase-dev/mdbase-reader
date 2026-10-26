// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { nativeReaderCollection } from "@mdbase-reader/connect/native";
import { memoryConnection } from "@mdbase-reader/connect/testing";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmProvider } from "./ConfirmProvider.js";
import { SettingsPage, useSettingsPage } from "./SettingsPage.js";
import { createRoot } from "./testing/i18n.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { ReaderSettingsStore } from "@mdbase-reader/connect";
import type { JSX } from "react";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const closers: (() => void)[] = [];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
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
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  for (const close of closers.splice(0)) {
    close();
  }
  vi.restoreAllMocks();
});

/** The workspace, reduced to the display menu and what Settings needs from it. */
function Workspace({
  settings,
}: {
  readonly settings: ReaderSettingsStore | undefined;
}): JSX.Element {
  const page = useSettingsPage();
  const gateway = {
    settings,
    annotations: () => Promise.resolve([]),
  } as unknown as ReaderWorkspaceGateway;
  return (
    <>
      <div className="workspace" inert={page.open}>
        <details>
          <summary>Aa</summary>
          <button type="button" onClick={page.show}>
            Settings…
          </button>
        </details>
      </div>
      {page.open ? (
        <SettingsPage
          density="comfortable"
          display={{
            theme: "system",
            onChangeTheme: () => undefined,
            density: "comfortable",
            sidebarWhileReading: "hide",
          }}
          gateway={gateway}
          library={[]}
          openSources={[]}
          collectionName="Reading"
          connectionState="connected"
          beforeCollectionSwitch={() => true}
          onClose={page.hide}
        />
      ) : null}
    </>
  );
}

async function render(settings?: ReaderSettingsStore): Promise<void> {
  await act(async () =>
    root.render(
      <ConfirmProvider>
        <Workspace settings={settings} />
      </ConfirmProvider>,
    ),
  );
}

async function collectionSettings(): Promise<ReaderSettingsStore> {
  const memory = await memoryConnection();
  closers.push(memory.close);
  const collection = nativeReaderCollection(memory.connection);
  closers.push(() => collection.dispose());
  if (!collection.settings) {
    throw new Error("A native collection has settings.");
  }
  return collection.settings;
}

/** Let the lazy sections load and the store read. */
async function settle(): Promise<void> {
  for (let round = 0; round < 8; round += 1) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
}

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find(
    (candidate) =>
      candidate.textContent.trim() === name || candidate.getAttribute("aria-label") === name,
  );
  if (!found) {
    throw new Error(`Missing button ${name}`);
  }
  return found;
}

async function openSettings(): Promise<void> {
  const details = document.querySelector("details")!;
  details.open = true;
  const item = button("Settings…");
  item.focus();
  await act(async () => {
    // As the menu does: it closes before the item's action runs.
    details.open = false;
    item.click();
  });
  // The sections load on demand: wait for them, then for the store's first read.
  for (let waited = 0; !document.querySelector(".settings-section") && waited < 5000;) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    waited += 20;
  }
  await settle();
}

async function type(field: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

describe("SettingsPage", () => {
  it("opens as a page with its heading focused, and returns focus to the menu on Back", async () => {
    await render(await collectionSettings());
    await openSettings();
    const heading = document.querySelector("h1");
    expect(heading?.textContent).toBe("Settings");
    expect(document.activeElement).toBe(heading);
    expect(document.querySelector("main")?.getAttribute("aria-labelledby")).toBe(heading?.id);
    expect(document.querySelector(".workspace")?.hasAttribute("inert")).toBe(true);
    expect([...document.querySelectorAll("h2")].map((section) => section.textContent)).toEqual([
      "This device",
      "This collection",
      "Connection",
    ]);
    expect(document.body.textContent).toContain("Default highlight colour");
    expect(document.querySelector("h3")?.textContent).toBe("Highlight colours");

    await act(async () => button("Back").click());
    await settle();
    expect(document.querySelector("h1")).toBeNull();
    expect(document.querySelector(".workspace")?.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(document.querySelector("summary"));
  });

  it("keeps workspace shortcuts from acting behind the page", async () => {
    await render(await collectionSettings());
    await openSettings();
    const shortcut = vi.fn();
    document.addEventListener("keydown", shortcut);
    document
      .querySelector("h1")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    document.removeEventListener("keydown", shortcut);
    expect(shortcut).not.toHaveBeenCalled();
  });

  it("asks before leaving unsaved collection settings", async () => {
    await render(await collectionSettings());
    await openSettings();
    await type(
      document.querySelector<HTMLInputElement>('input[aria-label="Yellow meaning"]')!,
      "Claim",
    );
    await act(async () => button("Back").click());
    await settle();
    expect(document.querySelector(".reader-confirm-dialog")?.textContent).toContain(
      "Your changes to highlight colours have not been saved.",
    );
    await act(async () => button("Keep editing").click());
    await settle();
    expect(document.querySelector("h1")).not.toBeNull();

    await act(async () => button("Back").click());
    await settle();
    await act(async () => button("Discard changes").click());
    await settle();
    expect(document.querySelector("h1")).toBeNull();
  });

  it("explains a collection without settings support instead of showing its sections", async () => {
    await render(undefined);
    await openSettings();
    expect(document.body.textContent).toContain("Reading can’t hold shared settings");
    expect(document.querySelector("h3")).toBeNull();
    // Leaving needs no confirmation.
    await act(async () => button("Back").click());
    await settle();
    expect(document.querySelector("h1")).toBeNull();
  });
});
