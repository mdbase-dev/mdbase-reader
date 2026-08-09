import { describe, expect, it } from "vitest";

import { onRequest } from "../functions/api/capture.js";

describe("web capture Pages Function", () => {
  it("allows only same-origin Reader POST requests", async () => {
    const denied = await onRequest({
      request: new Request("https://reader.example/api/capture", {
        method: "POST",
        headers: {
          origin: "https://attacker.example",
          "content-type": "application/json",
          "x-mdbase-reader-capture": "1",
        },
        body: JSON.stringify({ url: "https://example.com" }),
      }),
    });
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({ code: "capture_origin_denied" });

    const wrongMethod = await onRequest({
      request: new Request("https://reader.example/api/capture"),
    });
    expect(wrongMethod.status).toBe(405);
  });

  it("applies URL policy before issuing an upstream request", async () => {
    const response = await onRequest({
      request: new Request("https://reader.example/api/capture", {
        method: "POST",
        headers: {
          origin: "https://reader.example",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
          "x-mdbase-reader-capture": "1",
        },
        body: JSON.stringify({ url: "https://127.0.0.1/private" }),
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "private_address" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
