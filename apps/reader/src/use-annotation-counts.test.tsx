// @vitest-environment happy-dom
import { sourceId } from "@mdbase-reader/core";
import { act, type JSX } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { TableValue } from "./LibraryCells.js";
import {
  useLibraryAnnotationCounts,
  type ReaderWorkspaceViewModel,
} from "./ReaderWorkspaceView.js";
import { partSource } from "./source-parts.fixtures.js";
import { createRoot } from "./testing/i18n.js";
import { useAnnotationCounts } from "./use-annotation-counts.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { SourceId } from "@mdbase-reader/core";

let root: ReturnType<typeof createRoot>;
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it.each(["error", "idle"] as const)(
  "resumes collection counts when selected-source Notes become %s",
  async (status) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const source = partSource("book");
    const annotationCounts = vi.fn().mockResolvedValue(new Map([[source.id, 9]]));
    const model = {
      gateway: { annotationCounts },
      library: { sources: [source], sourceIndex: { complete: true } },
      workspace: {
        sourceRecord: { status: "ready", value: source },
        annotations: { status: "loading" },
      },
    } as unknown as ReaderWorkspaceViewModel;
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    function Harness({ model }: { model: ReaderWorkspaceViewModel }): JSX.Element {
      const counts = useLibraryAnnotationCounts(model);
      return <span>{counts?.get(source.id) ?? "unknown"}</span>;
    }
    act(() => root.render(<Harness model={model} />));
    expect(annotationCounts).not.toHaveBeenCalled();
    expect(host.textContent).toBe("unknown");
    await act(async () => {
      root.render(
        <Harness
          model={{
            ...model,
            workspace: {
              ...model.workspace,
              annotations:
                status === "error" ? { status, message: "Notes unavailable" } : { status },
            },
          }}
        />,
      );
      await Promise.resolve();
    });
    expect(annotationCounts).toHaveBeenCalledOnce();
    expect(host.textContent).toBe("9");
  },
);

it("aborts collection counts while source annotations load and never substitutes zero", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let resolveCounts!: (counts: ReadonlyMap<SourceId, number>) => void;
  const pending = new Promise<ReadonlyMap<SourceId, number>>((resolve) => {
    resolveCounts = resolve;
  });
  const annotationCounts = vi.fn(() => pending);
  const gateway = { annotationCounts } as unknown as ReaderWorkspaceGateway;
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  function Harness({ enabled }: { enabled: boolean }): JSX.Element {
    const counts = useAnnotationCounts(gateway, enabled);
    return <span>{counts?.get(sourceId("book")) ?? "unknown"}</span>;
  }
  act(() => root.render(<Harness enabled />));
  expect(host.textContent).toBe("unknown");
  const request = annotationCounts.mock.calls[0] as unknown as [{ signal: AbortSignal }];
  act(() => root.render(<Harness enabled={false} />));
  expect(request[0].signal.aborted).toBe(true);
  await act(async () => {
    resolveCounts(new Map([[sourceId("book"), 9]]));
    await pending;
  });
  expect(host.textContent).toBe("unknown");
  act(() => root.render(<Harness enabled />));
  await act(async () => {
    await pending;
  });
  expect(host.textContent).toBe("9");
});

it.each([0, 9])(
  "reuses current counts (%i) on resume and rescans only after revision or gateway changes",
  async (count) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const book = sourceId("book");
    let revision = 0;
    let changed = (): void => undefined;
    const annotationCounts = vi
      .fn()
      .mockResolvedValue(new Map<SourceId, number>(count ? [[book, count]] : []));
    const gateway = {
      annotationCounts,
      annotationCountsRevision: () => revision,
      subscribeAnnotationCounts: (listener: () => void) => {
        changed = listener;
        return () => undefined;
      },
    } as unknown as ReaderWorkspaceGateway;
    const replacementCounts = vi.fn().mockResolvedValue(new Map([[book, count + 1]]));
    const replacement = { ...gateway, annotationCounts: replacementCounts };
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    function Harness({
      gateway,
      enabled,
    }: {
      gateway: ReaderWorkspaceGateway;
      enabled: boolean;
    }): JSX.Element {
      const counts = useAnnotationCounts(gateway, enabled);
      return <span>{counts === null ? "unknown" : String(counts.get(book) ?? 0)}</span>;
    }
    async function render(enabled: boolean, currentGateway = gateway): Promise<void> {
      await act(async () => {
        root.render(<Harness gateway={currentGateway} enabled={enabled} />);
        await Promise.resolve();
      });
    }
    await render(true);
    expect(annotationCounts).toHaveBeenCalledOnce();
    for (const enabled of [false, true, false, true]) {
      await render(enabled);
      expect(annotationCounts).toHaveBeenCalledOnce();
      expect(host.textContent).toBe(String(count));
    }
    await render(false);
    await act(async () => {
      revision += 1;
      changed();
      await Promise.resolve();
    });
    expect(host.textContent).toBe("unknown");
    expect(annotationCounts).toHaveBeenCalledOnce();
    await render(true);
    expect(annotationCounts).toHaveBeenCalledTimes(2);
    expect(host.textContent).toBe(String(count));
    await render(false, replacement);
    expect(host.textContent).toBe("unknown");
    expect(replacementCounts).not.toHaveBeenCalled();
    await render(true, replacement);
    expect(replacementCounts).toHaveBeenCalledOnce();
    expect(host.textContent).toBe(String(count + 1));
    await render(false, replacement);
    await render(true, replacement);
    expect(replacementCounts).toHaveBeenCalledOnce();
    expect(annotationCounts).toHaveBeenCalledTimes(2);
  },
);

it("invalidates old counts on membership changes and keeps failures unknown", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let revision = 0;
  let changed = (): void => undefined;
  const annotationCounts = vi
    .fn()
    .mockResolvedValueOnce(new Map([[sourceId("book"), 0]]))
    .mockRejectedValueOnce(new Error("Incomplete query"));
  const gateway = {
    annotationCounts,
    annotationCountsRevision: () => revision,
    subscribeAnnotationCounts: (listener: () => void) => {
      changed = listener;
      return () => undefined;
    },
  } as unknown as ReaderWorkspaceGateway;
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  function Harness(): JSX.Element {
    const counts = useAnnotationCounts(gateway);
    return <span>{counts?.get(sourceId("book")) ?? "unknown"}</span>;
  }
  await act(async () => {
    root.render(<Harness />);
    await Promise.resolve();
  });
  expect(host.textContent).toBe("0");
  await act(async () => {
    revision += 1;
    changed();
    await Promise.resolve();
  });
  expect(host.textContent).toBe("unknown");
});

it.each([undefined, 0, 144])("distinguishes unknown from a known count (%s)", (count) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <TableValue source={partSource("book")} column="annotations" annotations={count} />,
    ),
  );
  expect(host.textContent).toBe(count === undefined ? "…" : count === 0 ? "—" : "144");
  expect(Boolean(host.querySelector('[aria-label="Annotation count not yet known"]'))).toBe(
    count === undefined,
  );
});
