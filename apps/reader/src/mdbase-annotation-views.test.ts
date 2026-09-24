import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import {
  annotationViewConfiguration,
  annotationViewWhere,
  buildAnnotationViewDocument,
  buildSourceAnnotationsViewDocument,
  defaultAnnotationViewConfiguration,
  readerViewKind,
  type AnnotationViewConfiguration,
} from "./mdbase-annotation-views.js";

function frontmatter(document: string): Record<string, unknown> {
  return parseYaml(document.split("---")[1] ?? "") as Record<string, unknown>;
}

const configuration: AnnotationViewConfiguration = {
  columns: ["passage", "source", "created"],
  columnWidths: { passage: 500 },
  sortField: "source",
  sortDirection: "asc",
  filter: {
    query: "attention",
    type: "highlight",
    tag: "",
    sourceConditions: [{ key: "course", operator: "is", value: "Ethics" }],
  },
};

describe("saved annotation views", () => {
  it("writes an mdbase view of reader-annotation records that reads back the same", () => {
    const document = buildAnnotationViewDocument({ name: "Ethics quotes", configuration });
    const view = frontmatter(document);
    expect(view["query"]).toEqual({
      types: ["reader-annotation"],
      projections: {
        source_title: { expr: "source.asFile().title" },
        source_authors: { expr: "source.asFile().authors" },
      },
    });
    const [named] = view["views"] as Record<string, unknown>[];
    expect(named?.["select"]).toEqual([
      "target.quote.exact",
      "projection.source_title",
      "created_at",
    ]);
    expect(named?.["order_by"]).toEqual([
      { field: "projection.source_title", direction: "asc" },
      { field: "created_at", direction: "asc" },
    ]);
    const presentation = named?.["presentation"] as Record<string, unknown>;
    expect(readerViewKind(presentation)).toBe("annotations");
    expect(annotationViewConfiguration(presentation)).toEqual(configuration);
  });

  it("filters on the annotation's own fields and on its source through the link", () => {
    expect(annotationViewWhere(configuration.filter)).toBe(
      'annotation_type == "highlight" && source.asFile() != null && ' +
        "source.asFile().course.matches(" +
        JSON.stringify(
          "(?i)^(Ethics|\\[\\[[^\\]|]*\\|Ethics\\]\\]|\\[\\[([^\\]|]*/)?Ethics\\]\\])$",
        ) +
        ")",
    );
    expect(
      annotationViewWhere({ ...configuration.filter, type: "all", sourceConditions: [] }),
    ).toBe(null);
    expect(
      annotationViewWhere({ ...defaultAnnotationViewConfiguration.filter, tag: "draft" }),
    ).toMatch(/^tags\.exists\(entry, entry\.matches\(/u);
  });

  it("falls back to defaults for missing or invalid options", () => {
    expect(annotationViewConfiguration(undefined)).toEqual(defaultAnnotationViewConfiguration);
    expect(
      annotationViewConfiguration({
        options: { columns: ["nope", "type"], sortField: "title", columnWidths: { type: 5 } },
      }),
    ).toMatchObject({ columns: ["type"], sortField: "created", columnWidths: { type: 64 } });
  });

  it("tells Reader's view kinds apart and leaves other apps' views alone", () => {
    expect(readerViewKind({ options: { readerViewVersion: 1 } })).toBe("sources");
    expect(readerViewKind({ options: { readerViewVersion: 2 } })).toBeNull();
    expect(readerViewKind(undefined)).toBeNull();
  });

  it("writes one view that lists the annotations of the source it runs against", () => {
    const [named] = frontmatter(buildSourceAnnotationsViewDocument())["views"] as Record<
      string,
      unknown
    >[];
    expect(named?.["context"]).toEqual({
      this: { on_missing: "error", types: ["reader-source"] },
    });
    expect(named?.["where"]).toBe("source.asFile().file.path == this.file.path");
    expect(readerViewKind(named?.["presentation"] as Record<string, unknown>)).toBe(
      "source-annotations",
    );
  });
});
