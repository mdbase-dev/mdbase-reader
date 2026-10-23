import { describe, expect, it, vi } from "vitest";

import {
  beginExplicitReadingNavigation,
  hasExplicitReadingNavigation,
  restoreReadingLocation,
} from "./reading-navigation-priority.js";

import type { ReadingSurface } from "@mdbase-reader/reading-surface";

describe("passage navigation priority", () => {
  it("waits for in-flight resume and suppresses later resume hydration", async () => {
    let finish: (value: boolean) => void = () => undefined;
    const surface = {
      goTo: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            finish = resolve;
          }),
      ),
    } as unknown as ReadingSurface;
    const restoration = restoreReadingLocation(surface, {
      kind: "html",
      href: "page",
      progression: 0.8,
    });
    let ready = false;
    const navigation = beginExplicitReadingNavigation(surface).then(() => {
      ready = true;
    });
    expect(hasExplicitReadingNavigation(surface)).toBe(true);
    await Promise.resolve();
    expect(ready).toBe(false);
    finish(true);
    await restoration;
    await navigation;
    expect(ready).toBe(true);
  });
});
