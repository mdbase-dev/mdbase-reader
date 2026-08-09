// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { fetchWebCapture, webCaptureImport } from "./web-capture-client.js";

const capture = {
  submittedUrl: "https://example.com/submitted",
  canonicalUrl: "https://example.com/canonical",
  retrievedAt: "2026-08-10T12:00:00.000Z",
  html: `<!doctype html><title>  A useful essay  </title><body onload="bad()">
    <script>bad()</script><h1>Fallback</h1><p>Readable</p>
    <img src="https://tracker.example/pixel"><iframe srcdoc="bad"></iframe></body>`,
};

describe("Reader web capture client", () => {
  it("turns a capture response into a safe immutable HTML import", async () => {
    const planned = await webCaptureImport(capture);
    const html = new TextDecoder().decode(planned.bytes);

    expect(planned).toMatchObject({
      name: "example.com.html",
      title: "A useful essay",
      capture: {
        submittedUrl: "https://example.com/submitted",
        canonicalUrl: "https://example.com/canonical",
        retrievedAt: "2026-08-10T12:00:00.000Z",
      },
    });
    expect(html).toContain("Readable");
    expect(html).toContain("Content-Security-Policy");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("tracker.example");
    expect(html).not.toContain("onload");
  });

  it("surfaces typed capture failures from the same-origin endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json(
          { code: "private_address", message: "Reader cannot capture private addresses." },
          { status: 400 },
        ),
      ),
    );

    await expect(fetchWebCapture("https://localhost", fetcher)).rejects.toThrow(
      "cannot capture private addresses",
    );
    expect(fetcher).toHaveBeenCalledWith(
      "/api/capture",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.objectContaining({ "x-mdbase-reader-capture": "1" }),
      }),
    );
  });
});
