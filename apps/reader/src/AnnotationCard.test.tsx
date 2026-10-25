// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import {
  annotationId,
  collectionId,
  dateTime,
  recordRevision,
  sourceId,
  type Annotation,
} from "@mdbase-reader/core";
import { act, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { AnnotationCard } from "./AnnotationCard.js";
import { setHighlightMeaning } from "./highlight-colors.js";

const base: Annotation = {
  id: annotationId("unanchored-note"),
  collectionId: collectionId("test"),
  sourceId: sourceId("source"),
  source: "[[source]]",
  annotationType: "note",
  createdAt: dateTime("2026-01-01T00:00:00Z"),
  tags: [],
  body: "My commentary",
  path: "notes/test.md",
  recordRevision: recordRevision("sha256:test"),
};
function card(
  annotation: Annotation,
  onOpen = vi.fn(),
  extra: Partial<Parameters<typeof AnnotationCard>[0]> = {},
): JSX.Element {
  return (
    <AnnotationCard
      {...extra}
      annotation={annotation}
      editing={false}
      active={false}
      transclusion={{
        busyId: null,
        problemId: null,
        problem: null,
        insert: vi.fn(),
        isEmbedded: () => false,
      }}
      onEdit={vi.fn()}
      onCancel={vi.fn()}
      onSave={() => Promise.resolve(annotation)}
      onPlanDelete={() => Promise.reject(new Error("not used"))}
      onDelete={() => Promise.resolve()}
      onOpen={onOpen}
      readFile={() => Promise.reject(new Error("not used"))}
    />
  );
}
function markup(annotation: Annotation): string {
  return renderToStaticMarkup(card(annotation));
}
it.each([undefined, { quote: { exact: "A quotation without coordinates" } }])(
  "omits navigation, without a warning, for notes without usable selectors",
  (target) => {
    const html = markup({ ...base, ...(target ? { target } : {}) });
    expect(html).not.toMatch(/>[^<]*(unanchored|passage anchor)/iu);
    expect(html).not.toContain('aria-label="Show in document"');
    expect(html).toContain("My commentary");
    expect(html).toMatch(/<button[^>]*>Edit<\/button>/u);
  },
);
it("uses a human HTML location in the inspector card and its tooltip", () => {
  const html = markup({
    ...base,
    locator: { label: "[[files/reader/src_19/page.html]]" },
    target: { html: { css: "p" }, quote: { exact: "A passage" } },
  });
  expect(html).toContain("Web page");
  expect(html).not.toContain("files/reader");
  expect(html).toContain('class="annotation-locator" title="Web page">Web page');
});

const linked: Annotation = {
  ...base,
  id: annotationId("anchored-note"),
  target: {
    quote: { exact: "Verified passage" },
    pdf: {
      pageIndex: 19,
      coordinateSpace: {
        profile: "embedpdf-selection-page-points-v1",
        box: "crop",
        origin: "top_left",
      },
      quadPoints: [[10, 20, 30, 20, 10, 40, 30, 40]],
    },
  },
};

it("offers navigation for a note with a verified PDF passage", () => {
  const html = markup(linked);
  expect(html).toContain('aria-label="Show in document"');
  expect(html).toContain("is-linked");
});

it("opens a linked card on click, but not when the click ends selecting its text", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const onOpen = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(card(linked, onOpen)));
  const element = host.querySelector<HTMLElement>(".annotation-card")!;

  document.getSelection()!.selectAllChildren(element);
  element.click();
  expect(onOpen).not.toHaveBeenCalled();

  document.getSelection()!.removeAllRanges();
  element.click();
  expect(onOpen).toHaveBeenCalledTimes(1);

  await act(async () => root.unmount());
  host.remove();
});

it("names the source only when the list says it differs from the open one", () => {
  const owners = [{ id: base.sourceId, title: "Chapter 2", documents: [] }] as never;
  const render = (showSource: boolean): string =>
    renderToStaticMarkup(card(base, vi.fn(), { owners, showSource }));
  expect(render(false)).not.toContain("Source:");
  expect(render(false)).not.toContain("Chapter 2");
  expect(render(true)).toContain("Source: <a");
  expect(render(true)).toContain("Chapter 2</a>");
});

it("marks a card outside its chapter's pages only when no heading groups it", () => {
  const document = { fileId: "file", revision: "rev" } as never;
  const owners = [
    {
      id: base.sourceId,
      title: "Chapter 2",
      documents: [{ ...(document as object), range: { kind: "pages", start: 0, end: 9 } }],
    },
  ] as never;
  const outside: Annotation = { ...linked, document };
  const render = (showLocation: boolean): string =>
    renderToStaticMarkup(card(outside, vi.fn(), { owners, showLocation }));
  expect(render(true)).toContain(">Outside chapter</small>");
  expect(render(false)).not.toContain("Outside chapter");
  expect(render(true)).not.toContain("still belongs to this chapter<");
});

it("leads with the quotation and leaves the location to a group heading", () => {
  const highlight: Annotation = {
    ...linked,
    annotationType: "highlight",
    locator: { label: "p. 20" },
  };
  const html = renderToStaticMarkup(card(highlight, vi.fn(), { showLocation: false }));
  expect(html.indexOf("<blockquote>")).toBeLessThan(html.indexOf("<time"));
  expect(html).not.toContain("annotation-locator");
  // A highlight's kind is carried by its name and ink, not a label on every card.
  expect(html).not.toContain('class="annotation-kind');
  expect(html).toContain('aria-label="Highlight annotation"');
});

it("takes the highlight's colour for its bar and says it in words", async () => {
  const highlight: Annotation = { ...linked, annotationType: "highlight", color: "green" };
  expect(markup(highlight)).toContain('data-highlight-color="green"');
  expect(markup({ ...highlight, color: "Orange" })).toContain('data-highlight-color="yellow"');
  expect(markup({ ...highlight, color: "#ff8800" })).toContain("--hl-ink:#ff8800");
  // Without a meaning the colour is named for screen readers only.
  expect(markup(highlight)).toContain('<span class="sr-only">Green</span>');

  setHighlightMeaning("green", "Evidence");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(card(highlight)));
  const meaning = host.querySelector(".annotation-meta .annotation-meaning");
  expect(meaning?.textContent).toBe("Evidence");
  expect(meaning?.getAttribute("title")).toBe("Green — Evidence");
  await act(async () => root.unmount());
  host.remove();
  setHighlightMeaning("green", "");
});

it("changes a highlight's colour from the More menu, even with one owner", async () => {
  const highlight: Annotation = { ...linked, annotationType: "highlight", color: "blue" };
  const onRecolor = vi.fn().mockResolvedValue(undefined);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(card(highlight, vi.fn(), { onRecolor })));
  const blue = host.querySelector(".annotation-card-colors [data-highlight-color='blue']");
  expect(blue?.getAttribute("aria-pressed")).toBe("true");
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(".annotation-card-colors [data-highlight-color='purple']")
      ?.click(),
  );
  expect(onRecolor).toHaveBeenCalledExactlyOnceWith(highlight, "purple");
  await act(async () => root.unmount());
  host.remove();
  // Notes have no colour to change, and without a way to recolour there is nothing to offer.
  expect(markup(base)).not.toContain("annotation-card-colors");
  expect(markup(highlight)).not.toContain("More actions");
});
