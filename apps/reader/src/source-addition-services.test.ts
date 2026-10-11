// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";

import { readerSourceAdditionServices } from "./source-addition-services.js";

import type { CaptureResult } from "./web-capture-client.js";
import type { Source } from "@mdbase-reader/core";
import type * as WebCapture from "@mdbase-reader/web-capture";

const mocks = vi.hoisted(() => ({ postFromUrl: vi.fn(), fetchCapture: vi.fn() }));
vi.mock("@mdbase-reader/web-capture", async (original) => ({
  ...(await original<typeof WebCapture>()),
  postFromUrl: mocks.postFromUrl,
}));
vi.mock("./web-capture-client.js", () => ({ fetchCapture: mocks.fetchCapture }));
const workspace = {
  importSourceFile: () => Promise.resolve(null),
  createSource: () => Promise.resolve(null),
  saveNewSourceCitation: (source: Source) => Promise.resolve(source),
};
afterEach(() => vi.clearAllMocks());

it("falls through to marker-aware HTML capture when a post-shaped path is not a Mastodon API", async () => {
  const result = { kind: "html" } as CaptureResult;
  mocks.postFromUrl.mockRejectedValue(new Error("Not Mastodon"));
  mocks.fetchCapture.mockResolvedValue(result);
  const services = readerSourceAdditionServices({ workspace, onStatus: vi.fn() });
  const url = "https://ordinary-site.test/@fixture/123";
  expect(await services.capture(url, { allowPdf: true })).toBe(result);
  expect(mocks.fetchCapture).toHaveBeenCalledWith(url, { allowPdf: true });
});

it("does not turn a known Bluesky API failure into an ordinary article capture", async () => {
  mocks.postFromUrl.mockRejectedValue(new Error("AppView unavailable"));
  const services = readerSourceAdditionServices({ workspace, onStatus: vi.fn() });
  await expect(
    services.capture("https://bsky.app/profile/did:plc:fixture/post/first", { allowPdf: true }),
  ).rejects.toThrow("AppView unavailable");
  expect(mocks.fetchCapture).not.toHaveBeenCalled();
});

it("preserves cancellation rather than starting an HTML fallback", async () => {
  const controller = new AbortController();
  controller.abort(new Error("Cancelled"));
  mocks.postFromUrl.mockRejectedValue(new Error("API request aborted"));
  const services = readerSourceAdditionServices({
    workspace,
    onStatus: vi.fn(),
    signal: controller.signal,
  });
  await expect(
    services.capture("https://ordinary-site.test/@fixture/123", {
      allowPdf: true,
      signal: controller.signal,
    }),
  ).rejects.toThrow("Cancelled");
  expect(mocks.fetchCapture).not.toHaveBeenCalled();
});
