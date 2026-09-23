import { collectionId, sourceId, type SourceSummary } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import {
  columnLabel,
  discoverPropertyKeys,
  formatPropertyValue,
  isLibraryColumn,
  propertyValue,
} from "./library-columns.js";
import {
  applyLibraryViewConfiguration,
  buildLibraryViewDocument,
  defaultLibraryViewConfiguration,
  libraryViewConfiguration,
} from "./mdbase-library-views.js";

function source(id: string, properties: Record<string, unknown>): SourceSummary {
  return {
    collectionId: collectionId("test"),
    id: sourceId(id),
    path: `sources/${id}.md`,
    title: id,
    creators: [],
    tags: [],
    documents: [],
    properties,
  };
}

describe("property columns", () => {
  it("reads dotted paths, preferring values a saved view selected", () => {
    const item = source("a", { course: "PHIL 201", csl: { volume: 4 } });
    expect(propertyValue(item, "course")).toBe("PHIL 201");
    expect(propertyValue(item, "csl.volume")).toBe(4);
    expect(propertyValue(item, "course", { course: "Selected" })).toBe("Selected");
    expect(propertyValue(item, "missing.deep")).toBeUndefined();
  });

  it("formats wikilinks, lists and booleans for reading", () => {
    expect(formatPropertyValue("[[projects/thesis|Thesis]]")).toBe("Thesis");
    expect(formatPropertyValue("[[projects/thesis]]")).toBe("thesis");
    expect(formatPropertyValue(["a", "[[b]]"])).toBe("a, b");
    expect(formatPropertyValue(true)).toBe("Yes");
    expect(formatPropertyValue(null)).toBe("");
  });

  it("labels fields and accepts only safe column names", () => {
    expect(columnLabel("property:reading_group")).toBe("Reading group");
    expect(columnLabel("property:course", [{ key: "course", label: "Module" }])).toBe("Module");
    expect(isLibraryColumn("property:csl.volume")).toBe(true);
    expect(isLibraryColumn("property:bad key")).toBe(false);
    expect(isLibraryColumn("nonsense")).toBe(false);
  });

  it("offers declared fields first, then common ones, without contract fields", () => {
    const sources = [
      source("a", { id: "a", title: "A", course: "x", priority: 1 }),
      source("b", { id: "b", title: "B", course: "y" }),
    ];
    expect(discoverPropertyKeys(sources, [{ key: "priority" }])).toEqual(["priority", "course"]);
  });

  it("sorts by a property, numbers numerically", () => {
    const sorted = applyLibraryViewConfiguration(
      [source("a", { priority: 10 }), source("b", { priority: 2 })],
      { ...defaultLibraryViewConfiguration, sortField: "property:priority", sortDirection: "asc" },
    );
    expect(sorted.map(({ title }) => title)).toEqual(["b", "a"]);
  });
});

describe("saved view layout", () => {
  it("round-trips property columns, widths and property sorting through the view file", () => {
    const configuration = {
      ...defaultLibraryViewConfiguration,
      columns: ["title", "property:course", "status"] as const,
      columnWidths: { title: 420, "property:course": 150 },
      sortField: "property:course" as const,
      sortDirection: "asc" as const,
    };
    const document = buildLibraryViewDocument({ name: "Courses", configuration });
    const frontmatter = parseYaml(document.split("---")[1] ?? "") as {
      views: [
        { select: string[]; order_by: [{ field: string }]; presentation: Record<string, unknown> },
      ];
    };
    const [view] = frontmatter.views;
    expect(view.select).toEqual(["title", "course", "reading.status"]);
    expect(view.order_by[0].field).toBe("course");
    const parsed = libraryViewConfiguration(view.presentation);
    expect(parsed.columns).toEqual(configuration.columns);
    expect(parsed.columnWidths).toEqual(configuration.columnWidths);
    expect(parsed.sortField).toBe("property:course");
  });

  it("clamps stored widths and drops unknown columns", () => {
    const parsed = libraryViewConfiguration({
      type: "table",
      options: { columns: ["title", "bogus"], columnWidths: { title: 5, bogus: 100 } },
    });
    expect(parsed.columns).toEqual(["title"]);
    expect(parsed.columnWidths).toEqual({ title: 64 });
  });
});
