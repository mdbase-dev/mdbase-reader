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
  vi.useRealTimers();
});

it("offers a reload only when the SDK marks pending writes as long", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  let changed: () => void = () => undefined;
  let snapshot = {
    sync: {
      state: "saving",
      pendingFor: "short",
      writes: {
        pending: [{ mutationId: "stalled", records: [], createdAt: Date.now() }],
        rejected: [],
      },
    },
  };
  const mdbase = {
    subscribe: (listener: () => undefined) => {
      changed = listener;
      return () => undefined;
    },
    getSnapshot: () => snapshot,
  } as unknown as Mdbase;
  root = createRoot(host);
  act(() => root.render(<ReaderSaveStatus mdbase={mdbase} online={true} />));
  expect(document.querySelector(".reader-save-details > button")).toBeNull();
  act(() => {
    snapshot = { ...snapshot, sync: { ...snapshot.sync, pendingFor: "long" } };
    changed();
  });
  expect(document.querySelector(".reader-save-details > button")?.textContent).toContain(
    "Reload Reader",
  );
});

it("shows the actual pending change and drops the warning only when the ledger drains", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  let changed: () => void = () => undefined;
  let snapshot = {
    phase: { kind: "starting" },
    saveWarning: "storage_may_be_evicted",
    sync: {
      writes: {
        pending: [{ mutationId: "owned-write", records: ["owned-file"], createdAt: Date.now() }],
        rejected: [],
      },
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
        <ReaderSaveStatus mdbase={mdbase} online={true} />
      </SourceLibraryContext>,
    ),
  );
  act(() => host.querySelector("summary")?.click());
  expect(host.querySelector("details")?.open).toBe(true);
  expect(document.body.textContent).toContain("1 pending");
  expect(document.body.textContent).toContain("owned-write");
  expect(document.body.textContent).toContain("owned-file");
  expect(document.querySelector(".reader-save-details li > strong")?.textContent).toBe(
    "Changes to An owned source",
  );
  expect(document.querySelector(".reader-save-details li > span")?.textContent).toBe(
    "Waiting for confirmation",
  );
  expect(document.body.textContent).toContain("This browser may remove its local copy");
  expect(document.querySelector(".reader-save-details > button")).toBeNull();
  expect(document.querySelector(".reader-save-details li details")?.hasAttribute("open")).toBe(
    false,
  );
  act(() => {
    snapshot = { ...snapshot, sync: { writes: { pending: [], rejected: [] } } };
    changed();
  });
  expect(host.querySelector("details")).toBeNull();
});

it("keeps offline writes calm and follows the SDK's pending age after reconnect", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  let changed: () => void = () => undefined;
  let snapshot = {
    saveWarning: "storage_may_be_evicted",
    sync: {
      connection: "offline",
      state: "saved_on_device",
      pendingFor: "long",
      writes: {
        pending: [{ mutationId: "offline", records: [], createdAt: Date.now() - 60_000 }],
        rejected: [],
      },
    },
  };
  const mdbase = {
    subscribe: (listener: () => undefined) => {
      changed = listener;
      return () => undefined;
    },
    getSnapshot: () => snapshot,
  } as unknown as Mdbase;
  root = createRoot(host);
  act(() => root.render(<ReaderSaveStatus mdbase={mdbase} online={true} />));
  expect(document.body.textContent).toContain("still pending on this device");
  expect(document.body.textContent).not.toContain("may remove");
  expect(document.querySelector(".reader-save-details > button")).toBeNull();
  act(() => {
    snapshot = {
      ...snapshot,
      sync: { ...snapshot.sync, connection: "online", state: "saving", pendingFor: "short" },
    };
    changed();
  });
  expect(document.querySelector(".reader-save-details > button")).toBeNull();
  act(() => {
    snapshot = { ...snapshot, sync: { ...snapshot.sync, pendingFor: "long" } };
    changed();
  });
  expect(document.querySelector(".reader-save-details > button")?.textContent).toContain(
    "Reload Reader",
  );
});

it.each([
  [0, 1, "The collection refused these changes."],
  [1, 1, "The collection refused some changes. Other changes are still pending on this device."],
  [1, 0, "These changes are still pending on this device."],
  [
    0,
    0,
    "You can keep reading. Sync needs attention; keep this browser’s data until it is resolved.",
  ],
])(
  "reports inventory truthfully with a sync incident: %i pending, %i rejected",
  (pending, rejected, message) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div");
    document.body.append(host);
    const snapshot = {
      phase: { kind: "ready" },
      sync: {
        incidents: [
          {
            kind: "read_only",
            details: { service_code: "append_refused", reason: "collection_read_only" },
          },
          { kind: "log_regressed", details: {} },
        ],
        writes: {
          pending: Array.from({ length: pending }, () => ({
            mutationId: "retained-refusal",
            records: ["retained-record"],
            createdAt: Date.now(),
          })),
          rejected: Array.from({ length: rejected }, () => ({
            mutationId: "rejected-refusal",
            records: ["rejected-record"],
            createdAt: Date.now(),
            problem: { message: "The collection is read-only.", recovery: "contact_support" },
          })),
        },
      },
    };
    const mdbase = {
      subscribe: () => () => undefined,
      getSnapshot: () => snapshot,
    } as unknown as Mdbase;
    root = createRoot(host);
    act(() => root.render(<ReaderSaveStatus mdbase={mdbase} online={true} />));
    expect(document.body.textContent).toContain("Changes need attention");
    expect(document.body.textContent).toContain(message);
    expect(document.body.textContent.includes("pending on this device")).toBe(Boolean(pending));
    expect(document.body.textContent.includes("The collection refused")).toBe(Boolean(rejected));
    expect(document.querySelector(".reader-save-details > details")?.hasAttribute("open")).toBe(
      false,
    );
    expect(document.querySelector(".reader-save-details > button")?.className).toBe(
      "connection-secondary",
    );
    expect(document.body.textContent).toContain("append_refused");
    expect(document.body.textContent).toContain("collection_read_only");
    expect(document.querySelector(".reader-save-details > details")?.textContent).toContain(
      "log_regressed",
    );
    expect(snapshot.sync.writes.pending).toHaveLength(pending);
    expect(snapshot.sync.writes.rejected).toHaveLength(rejected);
  },
);
