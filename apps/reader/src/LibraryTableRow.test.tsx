// @vitest-environment happy-dom
import { act, type JSX } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { emptyRowSelection } from "./library-row-selection.js";
import { LibraryTableRow } from "./LibraryTableRow.js";
import { defaultLibraryView } from "./mdbase-library-views.js";
import { partSource } from "./source-parts.fixtures.js";
import { createRoot } from "./testing/i18n.js";
import { layoutOf } from "./use-library-layout-draft.js";
import { useLongPress } from "./use-long-press.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

const source = { ...partSource("Attention"), title: "Attention Is All You Need" };

function render(handlers: {
  readonly onMenu: (x: number, y: number) => void;
  readonly onSelect: () => void;
  readonly onOpen: () => void;
}): void {
  const layout = layoutOf(defaultLibraryView.configuration);
  function Harness(): JSX.Element {
    const press = useLongPress();
    return (
      <div role="grid">
        <LibraryTableRow
          sources={[source]}
          source={source}
          index={0}
          top={0}
          gridTemplateColumns="1fr"
          tabbable
          layout={layout}
          onLayoutChange={vi.fn()}
          properties={[]}
          propertyKeys={[]}
          valuesByPath={new Map()}
          annotationCounts={new Map()}
          focused
          selection={emptyRowSelection}
          onSelectionChange={vi.fn()}
          scrollRef={{ current: null }}
          onOpen={handlers.onOpen}
          onOpenBeside={vi.fn()}
          onSelect={handlers.onSelect}
          press={press}
          onLongPress={vi.fn()}
          onMenu={handlers.onMenu}
          editing={null}
          onEditCell={vi.fn()}
          onEditDone={vi.fn()}
        />
      </div>
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<Harness />));
}

it("opens the row's menu from its More actions button without selecting or opening it", () => {
  const handlers = { onMenu: vi.fn(), onSelect: vi.fn(), onOpen: vi.fn() };
  render(handlers);
  const more = document.querySelector<HTMLButtonElement>(
    'button[aria-label="More actions for Attention Is All You Need"]',
  );
  expect(more).not.toBeNull();
  // The grid's roving focus reaches rows; Shift+F10 opens the same menu from the keyboard.
  expect(more?.tabIndex).toBe(-1);
  expect(more?.closest("[role=gridcell]")?.getAttribute("aria-colindex")).toBe(
    String(defaultLibraryView.configuration.columns.length + 1),
  );
  act(() => more?.click());
  expect(handlers.onMenu).toHaveBeenCalledOnce();
  expect(handlers.onSelect).not.toHaveBeenCalled();
  expect(handlers.onOpen).not.toHaveBeenCalled();
});

it("leads the title cell with the title, then people and format as words", () => {
  render({ onMenu: vi.fn(), onSelect: vi.fn(), onOpen: vi.fn() });
  const title = document.querySelector(".is-title");
  expect(title?.querySelector("strong")?.textContent).toBe("Attention Is All You Need");
  expect(title?.querySelector(".library-title-format")?.textContent).toBe("PDF");
  expect(title?.querySelector(".source-format-tag")).toBeNull();
});
