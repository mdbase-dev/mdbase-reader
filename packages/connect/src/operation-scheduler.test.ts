import { describe, expect, it, vi } from "vitest";

import { ConnectOperationScheduler } from "./operation-scheduler.js";

describe("Reader Connect operation scheduling", () => {
  it("enforces one global concurrency limit across mixed producers", async () => {
    const scheduler = new ConnectOperationScheduler(2);
    let active = 0;
    let maximum = 0;
    const operations = Array.from({ length: 12 }, (_value, index) =>
      scheduler.run(async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        await Promise.resolve();
        active -= 1;
        return index;
      }),
    );

    await expect(Promise.all(operations)).resolves.toEqual(
      Array.from({ length: 12 }, (_value, index) => index),
    );
    expect(maximum).toBe(2);
  });

  it("admits queued foreground mutations before background reads", async () => {
    const scheduler = new ConnectOperationScheduler(1);
    let releaseFirst: () => void = () => undefined;
    const gate = new Promise<string>((resolve) => {
      releaseFirst = () => resolve("first");
    });
    const first = scheduler.run(() => gate);
    const order: string[] = [];
    const background = scheduler.run(() => {
      order.push("background");
      return Promise.resolve();
    });
    const foreground = scheduler.run(
      () => {
        order.push("foreground");
        return Promise.resolve();
      },
      { priority: "foreground" },
    );

    releaseFirst();
    await Promise.all([first, background, foreground]);
    expect(order).toEqual(["foreground", "background"]);
  });

  it("rejects a cancelled queued operation without starting it", async () => {
    const scheduler = new ConnectOperationScheduler(1);
    let releaseFirst: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = scheduler.run(() => gate);
    const controller = new AbortController();
    const operation = vi.fn(() => Promise.resolve("unexpected"));
    const queued = scheduler.run(operation, { signal: controller.signal });

    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    releaseFirst();
    await first;
    expect(operation).not.toHaveBeenCalled();
  });
});
