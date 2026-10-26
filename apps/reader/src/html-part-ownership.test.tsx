// @vitest-environment happy-dom
import { fileRevision, sourceId } from "@mdbase-reader/core";
// Renderer integration test: exercise the real capability through Reader’s neutral ownership hook.
// eslint-disable-next-line no-restricted-imports
import { HtmlDocumentRuntime, HtmlReadingSurface } from "@mdbase-reader/renderer-html";
import { act, useMemo } from "react";
import { expect, it, vi } from "vitest";

import { setAnnotationOwnerPreference } from "./annotation-owner-preference.js";
import { PreviewGateway } from "./preview.js";
import { createRoot } from "./testing/i18n.js";
import { useAnnotationOwner } from "./use-annotation-owner.js";

import type { ComposerSelection } from "./annotation-composer-request.js";
import type { AnnotationOwnerControl } from "./use-annotation-owner.js";
import type { AnnotationTarget, DocumentDescriptor } from "@mdbase-reader/core";

it("defaults a book-session HTML selection to its verified part, falling back with reasons when uncertain", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const gateway = new PreviewGateway();
  const originalBook = (await gateway.source(sourceId("src_anthology")))!;
  const originalPart = (await gateway.source(sourceId("src_anthology_chapter_1")))!;
  const entry: DocumentDescriptor = {
    ...originalBook.documents[0]!,
    file: "[[files/book.html]]",
    mediaType: "text/html",
  };
  const book = { ...originalBook, documents: [entry] };
  const part = {
    ...originalPart,
    documents: [
      { ...entry, range: { kind: "fragment", start: "#chapter", end: "#next" } as const },
    ],
  };
  const frame = document.createElement("iframe");
  const host = document.createElement("div");
  document.body.append(frame, host);
  frame.contentDocument!.body.innerHTML =
    '<p>Before</p><section id="chapter"><p id="passage">Inside the chapter</p></section><h2 id="next">Next chapter</h2>';
  const surface = new HtmlReadingSurface(
    {
      document: entry,
      mediaType: "text/html",
      url: "https://reader.test/book.html",
    },
    new HtmlDocumentRuntime(frame, entry.file),
  );
  const contains = vi.spyOn(surface.capabilities.annotationRange!, "contains");
  const root = createRoot(host);
  let control: AnnotationOwnerControl | undefined;
  const create = vi.fn();
  const sources = [book, part];
  const staleSources = [
    book,
    {
      ...part,
      documents: [{ ...part.documents[0]!, revision: fileRevision(`sha256:${"b".repeat(64)}`) }],
    },
  ];
  setAnnotationOwnerPreference("chapter");
  function Probe({ target, stale = false }: { target: AnnotationTarget; stale?: boolean }): null {
    const selection = useMemo<ComposerSelection>(
      () => ({
        kind: "text",
        value: {
          target: { ...target, quote: target.quote! },
          locator: { kind: "html", href: entry.file },
        },
      }),
      [target],
    );
    const result = useAnnotationOwner({
      source: book,
      sources: stale ? staleSources : sources,
      surface,
      selection,
      create,
    });
    control = result.control;
    return null;
  }
  async function render(target: AnnotationTarget, stale = false): Promise<void> {
    await act(async () => {
      root.render(<Probe target={target} stale={stale} />);
      await Promise.resolve();
    });
  }
  try {
    await render({ quote: { exact: "Inside the chapter" }, html: { css: "#passage" } });
    expect(control).toMatchObject({
      ownerId: part.id,
      pending: false,
      reason: expect.stringContaining("verified range"),
    });
    expect(contains).toHaveBeenCalled();

    await render({ quote: { exact: "Next chapter" } });
    expect(control).toMatchObject({
      ownerId: book.id,
      pending: false,
      reason: expect.stringContaining("No verified chapter"),
    });

    await render({ quote: { exact: "chapterNext" } });
    expect(control).toMatchObject({
      ownerId: book.id,
      pending: false,
      reason: expect.stringContaining("unverified"),
    });

    await render({ quote: { exact: "Inside the chapter" }, html: { css: "#missing" } });
    expect(control).toMatchObject({
      ownerId: book.id,
      pending: false,
      reason: expect.stringContaining("unverified"),
    });

    contains.mockClear();
    await render({ quote: { exact: "Inside the chapter" } }, true);
    expect(control).toMatchObject({
      ownerId: book.id,
      pending: false,
      reason: expect.stringContaining("revision"),
    });
    expect(contains).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  } finally {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    await surface.destroy();
    frame.remove();
    host.remove();
    setAnnotationOwnerPreference("chapter");
    vi.unstubAllGlobals();
  }
});
