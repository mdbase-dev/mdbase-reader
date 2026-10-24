// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";

import { citationCard } from "./citation-card.js";
import { citationGroups } from "./citation-widgets.js";

import type { EditorView } from "@codemirror/view";

it("distinguishes citation details from citation Markdown without changing syntax", () => {
  const select = vi.fn();
  const edit = vi.fn();
  const dispatch = vi.fn();
  const card = citationCard(
    { dispatch } as unknown as EditorView,
    {
      group: citationGroups("[@example]")[0]!,
      candidates: [{ id: "example", label: "Example source" }],
      select,
    },
    undefined,
    edit,
  );
  const buttons = [...card.querySelectorAll("button")];
  expect(buttons.map((button) => button.textContent)).toEqual([
    "Edit citation details",
    "Edit citation Markdown",
  ]);
  expect(card.querySelector("code")?.textContent).toBe("[@example]");
  buttons[0]!.click();
  expect(edit).toHaveBeenCalledWith("example");
  buttons[1]!.click();
  expect(select).toHaveBeenCalled();
});
