import { describe, expect, it, vi } from "vitest";

import { capturePage } from "./capture-page.js";

const publicAddresses = vi.fn(() => Promise.resolve(["93.184.216.34"]));

describe("web page capture", () => {
  it("follows bounded, revalidated redirects and returns provenance with HTML", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "/canonical" } }),
      )
      .mockResolvedValueOnce(
        new Response("<!doctype html><title>Essay</title><p>Readable.</p>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );

    const result = await capturePage("https://example.com/submitted", {
      fetch: fetcher,
      resolveAddresses: publicAddresses,
      now: () => new Date("2026-08-10T12:00:00.000Z"),
    });

    expect(result).toEqual({
      submittedUrl: "https://example.com/submitted",
      canonicalUrl: "https://example.com/canonical",
      retrievedAt: "2026-08-10T12:00:00.000Z",
      html: "<!doctype html><title>Essay</title><p>Readable.</p>",
    });
    expect(publicAddresses).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });

  it("rejects non-HTML and oversized responses before returning content", async () => {
    await expect(
      capturePage("https://example.com/file", {
        fetch: vi.fn(() =>
          Promise.resolve(
            new Response("binary", { headers: { "content-type": "application/pdf" } }),
          ),
        ),
        resolveAddresses: publicAddresses,
        now: () => new Date(),
      }),
    ).rejects.toThrow("did not return an HTML page");

    await expect(
      capturePage("https://example.com/large", {
        fetch: vi.fn(() =>
          Promise.resolve(
            new Response("small", {
              headers: { "content-type": "text/html", "content-length": "3000000" },
            }),
          ),
        ),
        resolveAddresses: publicAddresses,
        now: () => new Date(),
      }),
    ).rejects.toThrow("2 MB capture limit");
  });
});
