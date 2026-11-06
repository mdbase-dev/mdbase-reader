// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ReaderSaveStatus } from "./ReaderSaveStatus.js";
import { SourceLibraryContext } from "./SourceLibraryContext.js";
import { createRoot } from "./testing/i18n.js";

import type { Mdbase } from "@mdbase-reader/connect/native";
import type { SourceSummary } from "@mdbase-reader/core";

let root: ReturnType<typeof createRoot>;
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it("shows the actual pending change and drops the warning only when the ledger drains", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  let changed: () => void = () => undefined;
  let snapshot = {
    saveWarning: "storage_may_be_evicted",
    writes: {
      pending: [{ mutationId: "owned-write", records: ["owned-file"], createdAt: Date.now() }],
      rejected: [],
    },
  };
  const mdbase = {
    subscribe: (listener: () => void) => {
      changed = listener;
      return () => undefined;
    },
    getSnapshot: () => snapshot,
  } as unknown as Mdbase;
  root = createRoot(host);
  const source = {
    title: "An owned source",
    documents: [{ fileId: "owned-file" }],
  } as unknown as SourceSummary;
  act(() =>
    root.render(
      <SourceLibraryContext value={[source]}>
        <ReaderSaveStatus mdbase={mdbase} connected={false} />
      </SourceLibraryContext>,
    ),
  );
  act(() => host.querySelector("summary")?.click());
  expect(host.querySelector("details")?.open).toBe(true);
  expect(host.textContent).toContain("1 pending");
  expect(host.textContent).toContain("owned-write");
  expect(host.textContent).toContain("owned-file");
  expect(host.querySelector(".reader-save-details li > span")?.textContent).toBe("An owned source");
  expect(host.textContent).toContain("This browser may remove its local copy");
  expect(host.querySelector(".reader-save-details > button")).toBeNull();
  expect(host.querySelector(".reader-save-details li details")?.hasAttribute("open")).toBe(false);
  act(() => {
    snapshot = { ...snapshot, writes: { pending: [], rejected: [] } };
    changed();
  });
  expect(host.querySelector("details")).toBeNull();
});
