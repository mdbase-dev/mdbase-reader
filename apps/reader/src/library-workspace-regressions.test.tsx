// @vitest-environment happy-dom
import { act, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { StatusPicker } from "./LibraryCells.js";
import { LibraryWorkspace } from "./LibraryWorkspace.js";
import { defaultLibraryView } from "./mdbase-library-views.js";
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
vi.mock("./LibraryCards.js", () => ({
  LibraryCards: ({ sources }: { sources: readonly SourceSummary[] }) => (
    <div data-cards>
      {sources.map((source) => (
        <p key={source.id}>{source.title}</p>
      ))}
    </div>
  ),
}));

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
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
): Promise<ReturnType<typeof vi.fn>> {
  const saveReadingStatus = vi.fn((id: SourceId, status: ReadingStatus) =>
    Promise.resolve({
      ...sources.find((source) => source.id === id)!,
      reading: { status },
    }),
  );
  const gateway = {
    executeLibraryView: vi.fn().mockResolvedValue({ sources, valuesByPath: new Map() }),
    readFile: vi.fn(),
    saveReadingStatus,
  } as unknown as ReaderWorkspaceGateway;
  function Harness(): React.JSX.Element {
    const [allSources, setSources] = useState(indexed);
    const status = useSourceStatus(gateway, (source) => setSources([source]));
    return (
      <>
        <LibraryWorkspace
          view={defaultLibraryView}
          availableViews={[defaultLibraryView]}
          allSources={allSources}
          indexLoading
          gateway={gateway}
          controller={{
            views: [defaultLibraryView],
            loading: false,
            saving: false,
            problem: null,
            view: () => defaultLibraryView,
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

it("shows every chapter in Cards without losing Table's collapse state", async () => {
  const sources = [
    partSource("Book"),
    partSource("Chapter", "Book"),
    partSource("Section", "Chapter"),
  ];
  await renderLibrary(sources, sources);
  await clickText("Toggle Book");
  expect(host.querySelector("[data-table]")?.textContent).not.toContain("Chapter");
  await clickText("Cards");
  expect(
    [...host.querySelectorAll("[data-cards] p")].map((element) => element.textContent),
  ).toEqual(["Book", "Chapter", "Section"]);
  await clickText("Table");
  expect(host.querySelector("[data-table]")?.textContent).not.toContain("Chapter");
});
