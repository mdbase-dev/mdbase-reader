// @vitest-environment happy-dom
import { act, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { StatusPicker } from "./LibraryCells.js";
import { LibraryWorkspace } from "./LibraryWorkspace.js";
import { defaultLibraryView, type MdbaseLibraryView } from "./mdbase-library-views.js";
import { partSource } from "./source-parts.fixtures.js";
import { createRoot } from "./testing/i18n.js";
import { useSourceStatus } from "./use-source-status.js";

import type { LibraryTableProps } from "./LibraryTable.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { ReadingStatus, Source, SourceId, SourceSummary } from "@mdbase-reader/core";

vi.mock("./LibraryTable.js", () => ({
  LibraryTable: ({ sources, onTogglePart, partRows, onChangeStatus }: LibraryTableProps) => (
    <div data-table>
      {sources.map((source) => (
        <div key={source.id}>
          <span>{source.title}</span>
          {partRows?.get(source.id)?.expandable ? (
            <button onClick={() => onTogglePart?.(source.id)}>Toggle {source.title}</button>
          ) : null}
          {onChangeStatus ? <StatusPicker source={source} onChange={onChangeStatus} /> : null}
        </div>
      ))}
    </div>
  ),
}));

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
const savedView = { ...defaultLibraryView, key: "saved", path: "views/saved.md" };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

async function renderLibrary(
  sources: readonly Source[],
  indexed: readonly SourceSummary[],
  executeLibraryView = vi.fn().mockResolvedValue({ sources, valuesByPath: new Map() }),
  view: MdbaseLibraryView = savedView,
): Promise<ReturnType<typeof vi.fn>> {
  const saveReadingStatus = vi.fn((id: SourceId, status: ReadingStatus) =>
    Promise.resolve({
      ...sources.find((source) => source.id === id)!,
      reading: { status },
    }),
  );
  const gateway = {
    executeLibraryView,
    allAnnotations: vi.fn().mockResolvedValue([]),
    searchText: vi.fn().mockResolvedValue([
      {
        sourceId: sources[0]?.id,
        kinds: ["note"],
        passages: [{ kind: "note", text: "Attention" }],
      },
    ]),
    readFile: vi.fn(),
    saveReadingStatus,
  } as unknown as ReaderWorkspaceGateway;
  function Harness(): React.JSX.Element {
    const [allSources, setSources] = useState(indexed);
    const status = useSourceStatus(gateway, (source) => setSources([source]));
    return (
      <>
        <LibraryWorkspace
          view={view}
          availableViews={[view]}
          allSources={allSources}
          indexLoading
          gateway={gateway}
          controller={{
            views: [view],
            loading: false,
            saving: false,
            problem: null,
            view: () => view,
            refresh: vi.fn(),
            save: vi.fn(),
          }}
          bibliographyExport={{
            itemCount: 0,
            problemCount: 0,
            problemSummary: null,
            status: "idle",
            message: null,
            run: vi.fn(),
            runFor: vi.fn(),
            setScope: vi.fn(),
          }}
          focused
          onOpenView={vi.fn()}
          onOpenSource={vi.fn()}
          onOpenBeside={vi.fn()}
          onAddSource={vi.fn()}
          changeStatus={status.change}
        />
        {status.notice}
      </>
    );
  }
  await act(async () => {
    root.render(<Harness />);
    await Promise.resolve();
  });
  return saveReadingStatus;
}

async function clickText(text: string): Promise<void> {
  const target = [...document.querySelectorAll<HTMLElement>("button, [role=option]")].find(
    (element) => element.textContent === text,
  );
  expect(target).toBeDefined();
  await act(async () => {
    target?.click();
    await Promise.resolve();
  });
}

it("saves and undoes a displayed row absent from the progressive global index", async () => {
  const source = { ...partSource("Not yet indexed"), readingStatus: "queued" as const };
  const save = await renderLibrary([source], []);
  const picker = host.querySelector<HTMLButtonElement>(
    '[aria-label="Reading status of Not yet indexed"]',
  );
  expect(picker).not.toBeNull();
  await act(async () => {
    picker?.click();
    await Promise.resolve();
  });
  const list = document.getElementById(picker!.getAttribute("aria-controls")!);
  const finished = list?.querySelector<HTMLElement>('[data-value="finished"]');
  expect(finished).not.toBeNull();
  await act(async () => {
    finished?.click();
    await Promise.resolve();
  });
  expect(save).toHaveBeenLastCalledWith(source.id, "finished");
  expect(host.querySelector("[data-table]")?.textContent).toContain("Finished");
  expect(document.body.textContent).toContain("“Not yet indexed” — Finished");
  await clickText("Undo");
  expect(save).toHaveBeenLastCalledWith(source.id, "queued");
  expect(host.querySelector("[data-table]")?.textContent).toContain("Queued");
});

it("clears the view failure after a successful reread", async () => {
  const sources = [partSource("Recovered")];
  const execute = vi
    .fn()
    .mockRejectedValueOnce(new Error("connection_unavailable"))
    .mockResolvedValue({ sources, valuesByPath: new Map() });
  await renderLibrary(sources, sources, execute);
  expect(host.querySelector(".library-view-problem")?.textContent).toBe(
    "Reader could not execute this mdbase view.",
  );
  await clickText("Annotations");
  await clickText("Sources");
  expect(execute).toHaveBeenCalledTimes(2);
  expect(host.querySelector(".library-view-problem")).toBeNull();
  expect(host.querySelector("[data-table]")?.textContent).toContain("Recovered");
});

it("uses the current index for All sources without executing a saved view", async () => {
  const indexed = [partSource("Indexed source")];
  const execute = vi.fn().mockResolvedValue({ sources: [], valuesByPath: new Map() });
  await renderLibrary(indexed, indexed, execute, defaultLibraryView);
  expect(host.querySelector("[data-table]")?.textContent).toContain("Indexed source");
  expect(execute).not.toHaveBeenCalled();
});

it("lists note and annotation matches above the table and focuses them first", async () => {
  const source = partSource("Attention");
  const other = partSource("Other");
  await renderLibrary([source, other], [source, other]);
  const search = host.querySelector<HTMLInputElement>(".library-search-field input")!;
  const type = (text: string): void =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, text);
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
  type("Other");
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
  // The note that matches belongs to a source the title search leaves out.
  const match = host.querySelector<HTMLButtonElement>(".search-passage-list button");
  expect(match?.textContent).toContain("Attention");
  expect(host.querySelector(".library-note-matches")?.textContent).toContain("1 source");
  expect(host.querySelector("[data-table]")?.textContent).toContain("Other");
  expect(host.querySelector('[aria-label="Search scope"]')).toBeNull();
  search.focus();
  act(() => {
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  });
  expect(document.activeElement).toBe(match);
  type("");
  expect(host.querySelector(".library-note-matches")).toBeNull();
});

it("closes status and returns focus to its row before any animation frame", () => {
  const source = partSource("Attention");
  const onChange = vi.fn();
  const frames = vi.fn();
  vi.stubGlobal("requestAnimationFrame", frames);
  act(() =>
    root.render(
      <div role="row" data-row-index="0" tabIndex={0}>
        <StatusPicker source={source} onChange={onChange} />
      </div>,
    ),
  );
  const row = host.querySelector<HTMLElement>("[data-row-index]")!;
  const picker = host.querySelector<HTMLButtonElement>('[role="combobox"]')!;
  act(() => picker.click());
  const list = host.querySelector<HTMLElement>('[role="listbox"]')!;
  list.focus();
  act(() => {
    list.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(picker.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(row);
  expect(onChange).not.toHaveBeenCalled();
  expect(frames).not.toHaveBeenCalled();
});
