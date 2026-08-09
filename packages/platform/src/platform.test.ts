import { describe, expect, it } from "vitest";

import { MemoryStorage } from "./platform.js";

describe("MemoryStorage", () => {
  it("implements the same asynchronous contract as native secure stores", async () => {
    const storage = new MemoryStorage();
    await storage.set("reader:position", "epubcfi(/6/2)");
    await expect(storage.get("reader:position")).resolves.toBe("epubcfi(/6/2)");
    await storage.remove("reader:position");
    await expect(storage.get("reader:position")).resolves.toBeNull();
  });
});
