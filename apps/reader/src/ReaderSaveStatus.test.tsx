// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ReaderSaveStatus } from "./ReaderSaveStatus.js";
import { createRoot } from "./testing/i18n.js";

import type { Mdbase } from "@mdbase-reader/connect/native";

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
  act(() => root.render(<ReaderSaveStatus mdbase={mdbase} />));
  act(() => host.querySelector("summary")?.click());
  expect(host.querySelector("details")?.open).toBe(true);
  expect(host.textContent).toContain("1 pending");
  expect(host.textContent).toContain("owned-write");
  expect(host.textContent).toContain("owned-file");
  expect(host.textContent).toContain("This browser may remove its local copy");
  act(() => {
    snapshot = { ...snapshot, writes: { pending: [], rejected: [] } };
    changed();
  });
  expect(host.querySelector("details")).toBeNull();
});
