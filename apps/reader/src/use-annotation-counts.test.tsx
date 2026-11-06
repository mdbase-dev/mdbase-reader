// @vitest-environment happy-dom
import { sourceId } from "@mdbase-reader/core";
import { act, type JSX } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { TableValue } from "./LibraryCells.js";
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
