import {
  collectionId,
  fileId,
  fileRevision,
  sourceId,
  type SourceSummary,
} from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { ContinueReading } from "./ContinueReading.js";
import { ReadingStatus, TableValue } from "./LibraryCells.js";
import { RenderedSourceDocument } from "./RenderedSourceDocument.js";
import { renderToStaticMarkup } from "./testing/i18n.js";

const source: SourceSummary = {
  collectionId: collectionId("test"),
  id: sourceId("test"),
  path: "test.md",
  title: "[test] A long source title RENAMED",
  creators: [],
  tags: [],
  reading: { status: "reading", progress: 0 },
  documents: [
    {
      fileId: fileId("test"),
      file: "[[test.html]]",
      mediaType: "text/html",
      revision: fileRevision(`sha256:${"a".repeat(64)}`),
      role: "primary",
    },
  ],
};

describe("Reader title and library polish", () => {
  it("uses live source metadata for its heading without rewriting saved document text", () => {
    const render = (current: SourceSummary): string =>
      renderToStaticMarkup(
        <RenderedSourceDocument
          source={current}
          sessionId="test"
          render={() => (
            <article>
              <h1>Original saved heading</h1>
              <p>Anchored text</p>
            </article>
          )}
          onSurfaceChange={() => undefined}
        />,
      );
    expect(render(source)).toContain(`<h1>${source.title}</h1>`);
    const renamed = render({ ...source, title: "[test] Newly renamed" });
    expect(renamed).toContain("<h1>[test] Newly renamed</h1>");
    expect(renamed).not.toContain(source.title);
    expect(renamed).toContain("<h1>Original saved heading</h1>");
    expect(renamed).toContain("Saved web page · original headings below are unchanged");
  });

  it("does not describe a PDF as a saved page with original headings", () => {
    const pdf: SourceSummary = {
      ...source,
      documents: source.documents.map((document) => ({
        ...document,
        file: "[[test.pdf]]",
        mediaType: "application/pdf",
      })),
    };
    const markup = renderToStaticMarkup(
      <RenderedSourceDocument
        source={pdf}
        sessionId="test"
        render={() => <div />}
        onSurfaceChange={() => undefined}
      />,
    );
    expect(markup).toContain(`<h1>${source.title}</h1>`);
    expect(markup).not.toContain("original headings");
    expect(markup).not.toContain("Saved");
  });

  it("shows zero progress once and exposes the full card title", () => {
    const markup = renderToStaticMarkup(
      <ContinueReading sources={[source]} onOpen={() => undefined} />,
    );
    expect(markup.match(/0%/g)).toHaveLength(1);
    expect(markup).toContain(`title="${source.title}"`);
  });

  it("omits an unknown creator rather than inventing metadata", () => {
    const markup = renderToStaticMarkup(
      <TableValue source={source} column="title" annotations={0} />,
    );
    expect(markup).not.toContain("Unknown creator");
    expect(markup).not.toContain("library-title-creators");
    expect(markup).toContain("Web page");
  });

  it("leads with the title and names people and format in words on a second line", () => {
    const markup = renderToStaticMarkup(
      <TableValue
        source={{ ...source, creators: ["Ada Author"] }}
        column="title"
        annotations={0}
      />,
    );
    expect(markup).not.toContain("source-format-tag");
    expect(markup.indexOf("<strong")).toBeLessThan(markup.indexOf("<small>"));
    expect(markup).toContain('<span class="library-title-creators">Ada Author</span>');
    expect(markup).toContain('<span class="library-title-format is-web">Web page</span>');
  });

  it("shows reading progress as a number beside the status word", () => {
    const markup = renderToStaticMarkup(
      <ReadingStatus source={{ ...source, reading: { status: "reading", progress: 0.42 } }} />,
    );
    expect(markup).toContain('<span class="library-status-word">Reading</span>');
    expect(markup).toContain(">42%</span>");
    expect(
      renderToStaticMarkup(
        <ReadingStatus source={{ ...source, reading: { status: "finished", progress: 1 } }} />,
      ),
    ).not.toContain("%");
  });

  it("shows reading status, not sharing status", () => {
    expect(
      renderToStaticMarkup(<ReadingStatus source={{ ...source, reading: { status: "queued" } }} />),
    ).toContain("Queued");
    expect(
      renderToStaticMarkup(
        <ReadingStatus source={{ ...source, reading: { status: "finished" } }} />,
      ),
    ).toContain("Finished");
  });
});
