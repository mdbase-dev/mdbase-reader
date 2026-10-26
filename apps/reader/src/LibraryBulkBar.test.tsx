// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { LibraryBulkBar } from "./LibraryBulkBar.js";
import { partSource } from "./source-parts.fixtures.js";
import { createRoot } from "./testing/i18n.js";

import type { BulkStatusProgress } from "./LibraryBulkBar.js";
import type { SourceSummary } from "@mdbase-reader/core";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

const sources = Array.from({ length: 12 }, (_, index) => partSource(String(index)));
function render(
  onSetField = vi.fn().mockResolvedValue(undefined),
  selected: readonly SourceSummary[] = sources,
): void {
  if (!root) {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  act(() =>
    root!.render(
      <LibraryBulkBar
        selected={selected}
        onClear={vi.fn()}
        onOpen={vi.fn()}
        onExport={vi.fn()}
        onSetField={onSetField}
        propertyKeys={["description", "url", "language", "csl.volume", "course", "id"]}
        properties={[{ key: "course", label: "Module" }]}
      />,
    ),
  );
}
function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((item) => item.textContent === text);
  expect(found, text).toBeDefined();
  return found!;
}
function click(text: string): void {
  act(() => button(text).click());
}
function choose(key: string): void {
  const choice = [...document.querySelectorAll<HTMLButtonElement>(".library-property-choice")].find(
    (item) => item.querySelector("code")?.textContent === key,
  );
  expect(choice).toBeDefined();
  act(() => choice!.click());
}
function input(label: string, value: string): void {
  const field = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function submit(): void {
  act(() => {
    document
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

it("offers friendly field names with raw keys, including declared labels", () => {
  render();
  click("Set field…");
  const choices = [...document.querySelectorAll(".library-property-choice")].map((item) => [
    item.querySelector("span")?.textContent,
    item.querySelector("code")?.textContent,
  ]);
  expect(choices).toEqual([
    ["Description", "description"],
    ["Url", "url"],
    ["Language", "language"],
    ["Volume", "csl.volume"],
    ["Module", "course"],
  ]);
});

it("never interprets an empty or whitespace value as a bulk clear", () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(save);
  click("Set field…");
  choose("csl.volume");
  expect(button("Apply").disabled).toBe(true);
  submit();
  input("Value", "   ");
  submit();
  expect(save).not.toHaveBeenCalled();
});

it("requires a separate count-bearing confirmation and allows cancellation", () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(save);
  click("Set field…");
  choose("csl.volume");
  click("Clear field…");
  expect(document.querySelector("[role=status]")?.textContent).toBe(
    "Clear Volume from 12 sources?",
  );
  submit();
  expect(save).not.toHaveBeenCalled();
  click("Keep field");
  expect(document.querySelector("[role=status]")).toBeNull();
  click("Clear field…");
  click("Clear Volume");
  expect(save).toHaveBeenCalledExactlyOnceWith(sources, "csl.volume", "", expect.any(Function));
});

it("invalidates clear approval when the field or selection changes", () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(save);
  click("Set field…");
  choose("csl.volume");
  click("Clear field…");
  choose("language");
  expect(document.querySelector("[role=status]")).toBeNull();
  click("Clear field…");
  render(save, sources.slice(0, 2));
  expect(document.querySelector("[role=status]")).toBeNull();
  expect(save).not.toHaveBeenCalled();
});

it("accepts custom keys, but not structural or invalid keys", () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(save);
  click("Set field…");
  click("Custom field…");
  input("Value", "3");
  for (const key of ["id", "documents.file", "csl", "bad key"]) {
    input("Custom field key", key);
    expect(button("Apply").disabled).toBe(true);
    submit();
  }
  expect(save).not.toHaveBeenCalled();
  input("Custom field key", "custom.score");
  click("Apply");
  expect(save).toHaveBeenCalledExactlyOnceWith(sources, "custom.score", "3", expect.any(Function));
});

it("does not offer to clear required fields", () => {
  render();
  click("Set field…");
  click("Custom field…");
  input("Custom field key", "title");
  expect(button("Clear field…").disabled).toBe(true);
});

it("reports changed and failed counts, rather than the selection size", async () => {
  let finish!: () => void;
  let report!: (progress: BulkStatusProgress) => void;
  const save = vi.fn((_sources, _key, _text, progress) => {
    report = progress;
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  render(save);
  click("Set field…");
  choose("csl.volume");
  input("Value", "3");
  click("Apply");
  expect(document.querySelector("[role=status]")?.textContent).toBe("Updating 0 of 12…");
  expect(button("Set field…").disabled).toBe(true);
  await act(async () => {
    report({ done: 12, total: 12, failed: 2, changed: 7 });
    finish();
    await Promise.resolve();
  });
  expect(document.querySelector("[role=status]")?.textContent).toBe(
    "7 sources updated; 2 sources could not be updated",
  );
});
