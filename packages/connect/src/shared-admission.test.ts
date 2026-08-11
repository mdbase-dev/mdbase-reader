import { describe, expect, it, vi } from "vitest";

import { connectLibraryViewRepository } from "./library-views.js";
import {
  ConnectOperationScheduler,
  readerConnectGlobalConcurrency,
} from "./operation-scheduler.js";
import { connectClient } from "./repository-client.js";

import type { ConnectOutcome, MdbaseConnection } from "@mdbase-dev/connect";

describe("shared Reader Connect admission", () => {
  it("bounds record queries and saved-view operations together", async () => {
    let active = 0;
    let maximum = 0;
    const operation = vi.fn(async (): Promise<ConnectOutcome<never>> => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active -= 1;
      return { ok: true, value: {} as never, diagnostics: [] };
    });
    const connection = {
      query: operation,
      listViews: operation,
    } as unknown as MdbaseConnection;
    const scheduler = new ConnectOperationScheduler(readerConnectGlobalConcurrency);
    const records = connectClient(connection, scheduler);
    const views = connectLibraryViewRepository(connection, scheduler);

    await Promise.all([
      ...Array.from({ length: 5 }, () => records.query({})),
      ...Array.from({ length: 5 }, () => views.list()),
    ]);

    expect(maximum).toBe(readerConnectGlobalConcurrency);
  });
});
