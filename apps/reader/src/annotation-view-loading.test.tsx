import { annotationId, collectionId, dateTime, sourceId } from "@mdbase-reader/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { emptyAnnotationFilter, type AnnotationEntry } from "./annotation-overview.js";
import { AnnotationProblem } from "./LibraryAnnotationBars.js";
import { sameAnnotationSelection, useVisibleEntries } from "./use-library-annotations.js";

function entry(id: string): AnnotationEntry {
  return {
    annotation: {
      id: annotationId(id),
      collectionId: collectionId("reading"),
      sourceId: sourceId("source"),
      path: `annotations/${id}.md`,
      source: "source",
      body: "Matching text",
      annotationType: "note",
      createdAt: dateTime("2026-08-09T00:00:00Z"),
      tags: [],
    },
    source: null,
    quote: "",
    note: "Matching text",
  };
}

describe("annotation view loading and selection", () => {
  it("keeps local search within the saved view's selection", () => {
    const all = [entry("selected"), entry("excluded")];
    let visible: readonly AnnotationEntry[] = [];
    function Probe(): null {
      visible = useVisibleEntries(
        all,
        { ...emptyAnnotationFilter, query: "matching" },
        emptyAnnotationFilter,
        new Set(["annotations/selected.md"]),
        { columns: [], columnWidths: {}, sortField: "created", sortDirection: "asc" },
      );
      return null;
    }
    renderToStaticMarkup(<Probe />);
    expect(visible.map(({ annotation }) => annotation.id)).toEqual(["selected"]);
    expect(
      sameAnnotationSelection(emptyAnnotationFilter, {
        ...emptyAnnotationFilter,
        query: "matching",
      }),
    ).toBe(true);
  });

  it("broadens to the whole collection only for changed structural filters", () => {
    expect(
      sameAnnotationSelection(emptyAnnotationFilter, { ...emptyAnnotationFilter, type: "note" }),
    ).toBe(false);
    expect(
      sameAnnotationSelection(emptyAnnotationFilter, {
        ...emptyAnnotationFilter,
        tag: "important",
      }),
    ).toBe(false);
  });

  it("announces both initial and progressive loading", () => {
    const initial = renderToStaticMarkup(
      <AnnotationProblem
        load={{ status: "loading" }}
        executionProblem={null}
        onRetry={() => undefined}
      />,
    );
    const progressive = renderToStaticMarkup(
      <AnnotationProblem
        load={{ status: "ready", annotations: [], loading: true }}
        executionProblem={null}
        onRetry={() => undefined}
      />,
    );
    const complete = renderToStaticMarkup(
      <AnnotationProblem
        load={{ status: "ready", annotations: [], loading: false }}
        executionProblem={null}
        onRetry={() => undefined}
      />,
    );
    expect(initial).toContain("Loading annotations");
    expect(progressive).toContain("Loading annotations");
    expect(complete).not.toContain("Loading annotations");
  });
});
