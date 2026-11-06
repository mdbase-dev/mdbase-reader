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

it("offers a reload for old pending writes even while syncing", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const host = document.createElement("div");
  document.body.append(host);
  const mdbase = {
    subscribe: () => () => undefined,
    getSnapshot: () => snapshot,
  } as unknown as Mdbase;
  const snapshot = {
    phase: { kind: "starting" },
    writes: {
      pending: [{ mutationId: "stalled", records: [], createdAt: Date.now() }],
      rejected: [],
    },
  };
  root = createRoot(host);
  act(() => root.render(<ReaderSaveStatus mdbase={mdbase} online={true} />));
  expect(host.querySelector(".reader-save-details > button")).toBeNull();
  await act(() => vi.advanceTimersByTime(29_999));
  expect(host.querySelector(".reader-save-details > button")).toBeNull();
  await act(() => vi.advanceTimersByTime(2));
  expect(host.querySelector(".reader-save-details > button")?.textContent).toContain(
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
        <ReaderSaveStatus mdbase={mdbase} online={true} />
      </SourceLibraryContext>,
    ),
  );
  act(() => host.querySelector("summary")?.click());
  expect(host.querySelector("details")?.open).toBe(true);
  expect(host.textContent).toContain("1 pending");
  expect(host.textContent).toContain("owned-write");
  expect(host.textContent).toContain("owned-file");
  expect(host.querySelector(".reader-save-details li > strong")?.textContent).toBe(
    "Changes to An owned source",
  );
  expect(host.querySelector(".reader-save-details li > span")?.textContent).toBe(
    "Waiting for confirmation",
  );
  expect(host.textContent).toContain("This browser may remove its local copy");
  expect(host.querySelector(".reader-save-details > button")).toBeNull();
  expect(host.querySelector(".reader-save-details li details")?.hasAttribute("open")).toBe(false);
  act(() => {
    snapshot = { ...snapshot, writes: { pending: [], rejected: [] } };
    changed();
  });
  expect(host.querySelector("details")).toBeNull();
});

it("stays calm offline and starts the stalled timer only on reconnect", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const host = document.createElement("div");
  document.body.append(host);
  const snapshot = {
    phase: { kind: "starting" },
    saveWarning: "storage_may_be_evicted",
    writes: {
      pending: [{ mutationId: "offline", records: [], createdAt: Date.now() - 60_000 }],
      rejected: [],
    },
  };
  const mdbase = {
    subscribe: () => () => undefined,
    getSnapshot: () => snapshot,
  } as unknown as Mdbase;
  root = createRoot(host);
  act(() => root.render(<ReaderSaveStatus mdbase={mdbase} online={false} />));
  await act(() => vi.advanceTimersByTime(60_000));
  expect(host.textContent).toContain("still pending on this device");
  expect(host.textContent).not.toContain("may remove");
  expect(host.querySelector(".reader-save-details > button")).toBeNull();
  act(() => root.render(<ReaderSaveStatus mdbase={mdbase} online={true} />));
  await act(() => vi.advanceTimersByTime(0));
  expect(host.querySelector(".reader-save-details > button")).toBeNull();
  await act(() => vi.advanceTimersByTime(29_999));
  expect(host.querySelector(".reader-save-details > button")).toBeNull();
  await act(() => vi.advanceTimersByTime(1));
  expect(host.querySelector(".reader-save-details > button")?.textContent).toContain(
    "Reload Reader",
  );
});

it.each(["saved_on_device", "saving"])(
  "keeps SDK-offline %s writes calm while the browser is online",
  async (saveState) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers();
    expect(navigator.onLine).toBe(true);
    const host = document.createElement("div");
    document.body.append(host);
    let changed: () => void = () => undefined;
    let snapshot = {
      phase: { kind: "starting" },
      sync: { kind: "offline" },
      saveWarning: "storage_may_be_evicted",
      writes: {
        saveState,
        pending: [{ mutationId: "offline-sdk", records: [], createdAt: Date.now() }],
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
    act(() => root.render(<ReaderSaveStatus mdbase={mdbase} online={navigator.onLine} />));
    for (let reconnect = 0; reconnect < 2; reconnect += 1) {
      await act(() => vi.advanceTimersByTime(60_000));
      expect(host.textContent).toContain("still pending on this device");
      expect(host.textContent).not.toContain("may remove");
      expect(host.querySelector(".reader-save-details > button")).toBeNull();
      act(() => {
        snapshot = { ...snapshot, sync: { kind: "synced" } };
        changed();
      });
      await act(() => vi.advanceTimersByTime(0));
      expect(host.querySelector(".reader-save-details > button")).toBeNull();
      await act(() => vi.advanceTimersByTime(29_999));
      expect(host.querySelector(".reader-save-details > button")).toBeNull();
      await act(() => vi.advanceTimersByTime(1));
      expect(host.querySelector(".reader-save-details > button")?.textContent).toContain(
        "Reload Reader",
      );
      act(() => {
        snapshot = { ...snapshot, sync: { kind: "offline" } };
        changed();
      });
      expect(host.querySelector(".reader-save-details > button")).toBeNull();
    }
  },
);

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
      phase: {
        kind: "ready",
        connection: {
          records: {
            status: {
              incidents: [
                {
                  kind: "read_only",
                  details: new Map([
                    ["service_code", "append_refused"],
                    ["reason", "collection_read_only"],
                  ]),
                },
                { kind: "log_regressed", details: new Map() },
              ],
            },
          },
        },
      },
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
    };
    const mdbase = {
      subscribe: () => () => undefined,
      getSnapshot: () => snapshot,
    } as unknown as Mdbase;
    root = createRoot(host);
    act(() => root.render(<ReaderSaveStatus mdbase={mdbase} online={true} />));
    expect(host.textContent).toContain("Changes need attention");
    expect(host.textContent).toContain(message);
    expect(host.textContent.includes("pending on this device")).toBe(Boolean(pending));
    expect(host.textContent.includes("The collection refused")).toBe(Boolean(rejected));
    expect(host.querySelector(".reader-save-details > details")?.hasAttribute("open")).toBe(false);
    expect(host.querySelector(".reader-save-details > button")?.className).toBe(
      "connection-secondary",
    );
    expect(host.textContent).toContain("append_refused");
    expect(host.textContent).toContain("collection_read_only");
    expect(host.querySelector(".reader-save-details > details")?.textContent).toContain(
      "log_regressed",
    );
    expect(snapshot.writes.pending).toHaveLength(pending);
    expect(snapshot.writes.rejected).toHaveLength(rejected);
  },
);
