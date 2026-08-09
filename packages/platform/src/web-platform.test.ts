import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWebPlatform } from "./web-platform.js";

describe("web file export", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("clicks an attached download link before revoking its object URL", async () => {
    const click = vi.fn();
    const remove = vi.fn();
    const append = vi.fn();
    const link = { href: "", download: "", hidden: false, click, remove };
    const createObjectURL = vi.fn(() => "blob:reader-export");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("document", {
      createElement: vi.fn(() => link),
      body: { append },
    });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.stubGlobal("window", { setTimeout });

    await createWebPlatform().saveFile("source.zip", new Blob(["portable"]));

    expect(append).toHaveBeenCalledWith(link);
    expect(link).toMatchObject({
      href: "blob:reader-export",
      download: "source.zip",
      hidden: true,
    });
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:reader-export");
  });
});
