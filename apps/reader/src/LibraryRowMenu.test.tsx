// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { LibraryRowMenu, type LibraryRowMenuActions } from "./LibraryRowMenu.js";
import { partSource } from "./source-parts.fixtures.js";
import { createRoot } from "./testing/i18n.js";

import type { SourceSummary } from "@mdbase-reader/core";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

function menu(source: SourceSummary, actions: Partial<LibraryRowMenuActions>): HTMLElement[] {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <LibraryRowMenu
        target={{ source, x: 10, y: 10 }}
        actions={{ onOpen: vi.fn(), onOpenBeside: vi.fn(), ...actions }}
        onClose={vi.fn()}
      />,
    ),
  );
  return [...document.querySelectorAll<HTMLElement>("[role=menuitem]")];
}

it("offers chapter creation for a PDF book row when chapter creation is available", () => {
  const book = partSource("book");
  const onCreateChapters = vi.fn();
  const item = menu(book, { onCreateChapters }).find(({ textContent }) =>
    textContent.includes("chapters"),
  );
  expect(item?.textContent).toBe("Add chapters as sources…");
  act(() => item!.click());
  expect(onCreateChapters).toHaveBeenCalledExactlyOnceWith(book);
});

it("leaves chapter creation out when it is off or the source has no PDF/EPUB", () => {
  const book = partSource("book");
  expect(menu(book, {}).some(({ textContent }) => textContent.includes("chapters"))).toBe(false);
  act(() => root?.unmount());
  const web = {
    ...book,
    documents: book.documents.map((document) => ({ ...document, mediaType: "text/html" })),
  };
  expect(
    menu(web, { onCreateChapters: vi.fn() }).some(({ textContent }) =>
      textContent.includes("chapters"),
    ),
  ).toBe(false);
});
