import { describe, expect, it } from "vitest";

import { writeCitationDrag } from "./citation-drag.js";

describe("citation drag payload", () => {
  it("offers Pandoc, Markdown, and portable CSL representations", () => {
    const values = new Map<string, string>();
    const data = {
      effectAllowed: "none",
      setData: (type: string, value: string) => values.set(type, value),
    } as unknown as DataTransfer;
    writeCitationDrag(data, { id: "dostoevsky1914", type: "book", title: "Crime and Punishment" });
    expect(data.effectAllowed).toBe("copy");
    expect(values.get("text/plain")).toBe("[@dostoevsky1914]");
    expect(JSON.parse(values.get("application/vnd.citationstyles.csl+json") ?? "")).toMatchObject({
      id: "dostoevsky1914",
    });
  });
});
