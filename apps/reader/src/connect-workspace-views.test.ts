import {
  collectionId,
  type AnnotationRepository,
  type SourceRepository,
} from "@mdbase-reader/core";
import { createReaderRuntimeServices, MemoryStorage } from "@mdbase-reader/platform";
import { describe, expect, it, vi } from "vitest";

import { ConnectWorkspaceGateway } from "./connect-workspace.js";
import { defaultLibraryView, defaultLibraryViewConfiguration } from "./mdbase-library-views.js";

import type { LibraryViewRepository } from "@mdbase-reader/connect";

type ViewList = Awaited<ReturnType<LibraryViewRepository["list"]>>;
type ViewDocument = ViewList["views"][number];
type NamedView = ViewDocument["views"][number];

function namedView(id: string, presentation?: NamedView["presentation"]): NamedView {
  return { id, name: id, properties: [], ...(presentation ? { presentation } : {}) };
}
function document(id: string, views: NamedView[]): ViewDocument {
  return {
    id,
    name: id,
    source: {
      path: `views/${id}.mdbase.view`,
      format: "mdbase.view",
      revision: "rev-1",
      writable: true,
    },
    views,
  };
}
function gateway(repository?: LibraryViewRepository): ConnectWorkspaceGateway {
  return new ConnectWorkspaceGateway(
    {} as SourceRepository,
    {} as AnnotationRepository,
    { store: vi.fn() },
    { findExactDuplicate: vi.fn(), commitFile: vi.fn() },
    collectionId("reading"),
    "Reading",
    createReaderRuntimeServices(new MemoryStorage()),
    undefined,
    undefined,
    repository,
  );
}
function repository(views: ViewDocument[]): LibraryViewRepository {
  return {
    list: vi
      .fn()
      .mockResolvedValue({ views, meta: { totalCount: views.length } } satisfies ViewList),
    execute: vi.fn(),
    save: vi.fn(),
  };
}

describe("Reader saved-view discovery", () => {
  it("lists All sources and explicitly Reader-marked views, filtering each named view", async () => {
    const cards = {
      ...namedView("Reading queue", { type: "cards", options: { readerViewVersion: 1 } }),
      properties: [{ key: "title", label: "Title" }],
    };
    const views = repository([
      document("tasknotes", [
        namedView("Tasks", { type: "tasknotes.task-list" }),
        namedView("Board", { type: "tasknotes.kanban", fallback: "table" }),
      ]),
      document("shared", [cards, namedView("Unrelated table", { type: "table" })]),
      // Names and document namespaces alone must not count as Reader markers.
      document("reader.library.unmarked", [
        namedView("All sources", { type: "cards" }),
        namedView("Plain"),
      ]),
      document("reader-table", [
        namedView("Finished", { type: "table", options: { readerViewVersion: 1 } }),
      ]),
    ]);
    const options = { signal: new AbortController().signal };
    const result = await gateway(views).listLibraryViews(options);
    expect(result.map(({ name }) => name)).toEqual(["All sources", "Reading queue", "Finished"]);
    expect(result[0]).toEqual(defaultLibraryView);
    expect(result[1]).toMatchObject({
      key: "views/shared.mdbase.view::Reading queue",
      path: "views/shared.mdbase.view",
      revision: "rev-1",
      writable: true,
      owned: true,
      properties: [{ key: "title", label: "Title" }],
      configuration: { presentation: "cards" },
    });
    expect(views.list).toHaveBeenCalledExactlyOnceWith(options);
    expect(views.execute).not.toHaveBeenCalled();
    expect(views.save).not.toHaveBeenCalled();
  });

  it("does not accept unrelated, malformed, or unsupported version markers", async () => {
    const views = repository([
      document("other", [
        namedView("Missing", { type: "table", options: {} }),
        namedView("TaskNotes", { type: "table", options: { tasknotesViewVersion: 1 } }),
        ...["1", true, 0, 2, null].map((version, index) =>
          namedView(`Invalid ${String(index)}`, {
            type: "table",
            options: { readerViewVersion: version },
          }),
        ),
      ]),
    ]);
    expect(await gateway(views).listLibraryViews()).toEqual([defaultLibraryView]);
  });

  it("retains All sources when no views or no view repository are available", async () => {
    expect(await gateway(repository([])).listLibraryViews()).toEqual([defaultLibraryView]);
    expect(await gateway().listLibraryViews()).toEqual([defaultLibraryView]);
  });

  it("can still reopen a newly saved Reader-marked view", async () => {
    const path = "views/saved.mdbase.view";
    const views = repository([
      document("saved", [
        namedView("Reading queue", {
          type: "table",
          options: { readerViewVersion: 1 },
        }),
      ]),
    ]);
    vi.mocked(views.save).mockResolvedValue({
      path,
      format: "mdbase.view",
      revision: "rev-1",
      document: "",
    });
    const result = await gateway(views).saveLibraryView({
      name: "Reading queue",
      configuration: defaultLibraryViewConfiguration,
    });
    expect(result).toMatchObject({ path, name: "Reading queue", owned: true });
    expect(views.save).toHaveBeenCalledWith({
      name: "Reading queue",
      document: expect.stringContaining("readerViewVersion: 1"),
    });
  });
});
