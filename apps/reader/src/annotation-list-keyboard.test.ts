// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";

import { annotationItemControls, annotationListKeyDown } from "./annotation-list-keyboard.js";

import type { KeyboardEvent } from "react";

function item(): { item: HTMLElement; summary: HTMLElement; details: HTMLDetailsElement } {
  const element = document.createElement("div");
  element.setAttribute("role", "listitem");
  element.dataset["index"] = "0";
  element.innerHTML = `
    <button type="button">Edit</button>
    <details><summary>More actions</summary>
      <label>Move annotation to source<select><option>Book</option></select></label>
    </details>`;
  document.body.append(element);
  return {
    item: element,
    summary: element.querySelector("summary")!,
    details: element.querySelector("details")!,
  };
}

function tab(target: HTMLElement, focusItem: (index: number) => void): void {
  const event = {
    key: "Tab",
    shiftKey: false,
    target,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent<HTMLDivElement>;
  annotationListKeyDown(event, 2, focusItem, vi.fn());
}

it("keeps Tab inside an open More menu so Move annotation to source is reachable", () => {
  const { item: element, summary, details } = item();
  details.open = true;
  expect(annotationItemControls(element).at(-1)?.tagName).toBe("SELECT");
  const focusItem = vi.fn();
  tab(summary, focusItem);
  expect(focusItem).not.toHaveBeenCalled();
  element.remove();
});

it("moves on to the next card from a closed menu's trigger", () => {
  const { item: element, summary } = item();
  expect(annotationItemControls(element).at(-1)).toBe(summary);
  const focusItem = vi.fn();
  tab(summary, focusItem);
  expect(focusItem).toHaveBeenCalledWith(1, false);
  element.remove();
});
