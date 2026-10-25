// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { toValue, type PlainValue } from "@mdbase-dev/sdk";
import { nativeReaderCollection } from "@mdbase-reader/connect/native";
import { memoryConnection } from "@mdbase-reader/connect/testing";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bindHighlightSettings, highlightChoices } from "./highlight-colors.js";
import { HighlightColorSettings } from "./HighlightColorSettings.js";

import type { ReaderSettingsStore } from "@mdbase-reader/connect";

const settingsPath = "_settings/dev.mdbase.reader.md";
const deviceMeaningsKey = "mdbase-reader:highlight-meanings";
const reserved = { app: "dev.mdbase.reader", scope: "collection", settings_version: 1 };

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const closers: (() => void)[] = [];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
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
});

async function open(seed?: Record<string, unknown>): Promise<{
  readonly settings: ReaderSettingsStore;
  readonly replica: Awaited<ReturnType<typeof memoryConnection>>["replica"];
  readonly connection: Awaited<ReturnType<typeof memoryConnection>>["connection"];
}> {
  const memory = await memoryConnection();
  closers.push(memory.close);
  if (seed) {
    memory.replica.seed({
      path: settingsPath,
      types: ["reader-settings"],
      // Lists and objects are arrays and data maps in the replica, as a save writes them.
      frontmatter: Object.fromEntries(
        Object.entries({ ...reserved, ...seed }).map(([key, value]) => [
          key,
          toValue(value as PlainValue),
        ]),
      ),
    });
  }
  const collection = nativeReaderCollection(memory.connection);
  closers.push(() => collection.dispose());
  const settings = collection.settings;
  if (!settings) {
    throw new Error("A native collection has settings.");
  }
  // As the workspace does: everything else follows the same store.
  closers.push(bindHighlightSettings(settings));
  await act(async () =>
    root.render(<HighlightColorSettings settings={settings} onClose={vi.fn()} />),
  );
  await settle();
  return { settings, replica: memory.replica, connection: memory.connection };
}

async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
}

const doc = (): Document => host.ownerDocument;

function rows(): string[] {
  return [...doc().querySelectorAll<HTMLElement>(".highlight-color-row")].map(
    (row) =>
      `${row.dataset["highlightColor"] ?? ""}${row.classList.contains("is-hidden") ? " (hidden)" : ""}`,
  );
}

function meaning(label: string): HTMLInputElement {
  return doc().querySelector<HTMLInputElement>(`input[aria-label="${label} meaning"]`)!;
}

function shown(label: string): HTMLInputElement {
  return meaning(label).closest("li")!.querySelector<HTMLInputElement>("input[type='checkbox']")!;
}

function button(name: string): HTMLButtonElement {
  const found = [...doc().querySelectorAll("button")].find(
    (candidate) => candidate.textContent === name || candidate.getAttribute("aria-label") === name,
  );
  if (!found) {
    throw new Error(`Missing button ${name}`);
  }
  return found;
}

async function type(field: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => element.click());
  await settle();
}

describe("HighlightColorSettings", () => {
  it("shows today's five colours, all offered, with no meanings, and nothing to save", async () => {
    await open();
    expect(rows()).toEqual(["yellow", "green", "blue", "pink", "purple"]);
    expect(meaning("Yellow").value).toBe("");
    expect(meaning("Yellow").placeholder).toBe("e.g. Key idea");
    expect(doc().body.textContent).toContain("also relabels the highlights already in that colour");
    expect(button("Save").disabled).toBe(true);
    expect(button("Reset to default").disabled).toBe(true);
  });

  it("hides, reorders and renames colours, and saves them to the collection", async () => {
    const { settings } = await open();
    await click(shown("Green"));
    await click(button("Move Blue up"));
    await click(button("Move Blue up"));
    expect(rows()).toEqual(["blue", "yellow", "green (hidden)", "pink", "purple"]);
    // Focus stays with the row that moved, so it can keep moving by keyboard.
    expect(doc().activeElement).toBe(button("Move Blue down"));
    expect(doc().body.textContent).toContain("Blue moved to position 1 of 5.");
    await type(meaning("Blue"), "  Definition  ");
    await click(button("Save"));
    expect(settings.getSnapshot().frontmatter).toMatchObject({
      highlight_colors: ["blue", "yellow", "pink", "purple"],
      highlight_meanings: { blue: "Definition" },
    });
    // Everything bound to the store follows at once.
    expect(highlightChoices().colors).toEqual(["blue", "yellow", "pink", "purple"]);
    expect(highlightChoices().meanings).toEqual({ blue: "Definition" });
  });

  it("keeps at least one colour offered", async () => {
    await open({ highlight_colors: ["pink"] });
    expect(rows()[0]).toBe("pink");
    expect(shown("Pink").checked).toBe(true);
    expect(shown("Pink").disabled).toBe(true);
    expect(shown("Yellow").checked).toBe(false);
  });

  it("resets to the default by removing both fields", async () => {
    const { settings } = await open({
      highlight_colors: ["pink", "blue"],
      highlight_meanings: { pink: "Question" },
    });
    await click(button("Reset to default"));
    expect(rows()).toEqual(["yellow", "green", "blue", "pink", "purple"]);
    await click(button("Save"));
    expect(settings.getSnapshot().frontmatter).not.toHaveProperty("highlight_colors");
    expect(settings.getSnapshot().frontmatter).not.toHaveProperty("highlight_meanings");
  });

  it("suggests this device's old meanings and saves them on the next save, never on read", async () => {
    localStorage.setItem(deviceMeaningsKey, JSON.stringify({ green: "Evidence" }));
    const { settings } = await open();
    expect(meaning("Green").value).toBe("Evidence");
    expect(doc().body.textContent).toContain("set on this device only");
    // Opening wrote nothing: there is still no record.
    expect(settings.getSnapshot().status).toBe("ready");
    expect(settings.getSnapshot().frontmatter).toBeUndefined();
    expect(button("Save").disabled).toBe(false);
    await click(button("Save"));
    expect(settings.getSnapshot().frontmatter).toMatchObject({
      highlight_meanings: { green: "Evidence" },
    });
    expect(localStorage.getItem(deviceMeaningsKey)).toBeNull();
    expect(highlightChoices().meaningsFromDevice).toBe(false);
  });

  it("ignores this device's old meanings once the collection has its own", async () => {
    localStorage.setItem(deviceMeaningsKey, JSON.stringify({ green: "Evidence" }));
    await open({ highlight_meanings: { blue: "Term" } });
    expect(meaning("Green").value).toBe("");
    expect(meaning("Blue").value).toBe("Term");
    expect(doc().body.textContent).not.toContain("set on this device only");
    expect(button("Save").disabled).toBe(true);
  });

  it("follows another device's edit of a field not being edited", async () => {
    const { connection } = await open();
    await type(meaning("Yellow"), "Claim");
    const elsewhere = nativeReaderCollection(connection);
    closers.push(() => elsewhere.dispose());
    await act(async () => {
      await elsewhere.settings?.save({ highlight_colors: ["purple", "yellow"] });
    });
    await settle();
    expect(rows()).toEqual([
      "purple",
      "yellow",
      "green (hidden)",
      "blue (hidden)",
      "pink (hidden)",
    ]);
    expect(meaning("Yellow").value).toBe("Claim");
  });

  it("names the setting another device changed instead of overwriting it", async () => {
    const { connection } = await open({ highlight_meanings: { blue: "Term" } });
    await type(meaning("Blue"), "Definition");
    const elsewhere = nativeReaderCollection(connection);
    closers.push(() => elsewhere.dispose());
    await act(async () => {
      await elsewhere.settings?.save({ highlight_meanings: { blue: "Word" } });
    });
    await settle();
    await click(button("Save"));
    expect(doc().body.textContent).toContain("The meanings changed somewhere else.");
  });

  it("is read-only, saying why, when a newer Reader wrote the settings", async () => {
    await open({ settings_version: 9 });
    expect(doc().querySelector(".file-name-settings-notice")?.textContent).toMatch(
      /newer version/u,
    );
    expect(meaning("Yellow").disabled).toBe(true);
    expect(button("Move Green up").disabled).toBe(true);
  });

  it("warns about a saved field it cannot use", async () => {
    await open({ highlight_colors: ["orange"] });
    expect(rows()).toEqual(["yellow", "green", "blue", "pink", "purple"]);
    expect(doc().querySelector(".file-name-template-warning")?.textContent).toMatch(
      /colours offered cannot be used/u,
    );
    expect(button("Reset to default").disabled).toBe(false);
  });
});
