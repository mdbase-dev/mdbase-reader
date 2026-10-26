// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { LibraryFieldCellEditor } from "./LibraryFieldCell.js";
import { partSource } from "./source-parts.fixtures.js";
import { createRoot } from "./testing/i18n.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  document.body.replaceChildren();
});

it("names the field editor with its friendly label", () => {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <LibraryFieldCellEditor
        source={{ ...partSource("book"), properties: { csl: { volume: 3 } } }}
        fieldKey="csl.volume"
        onSave={vi.fn().mockResolvedValue(undefined)}
        onDone={vi.fn()}
      />,
    ),
  );
  expect(host.querySelector("input")?.getAttribute("aria-label")).toBe("Edit Volume");
  expect(host.querySelector("input")?.value).toBe("3");
});
