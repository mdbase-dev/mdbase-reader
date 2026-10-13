import { expect, it, vi } from "vitest";

import { completeAppGrantCallback, isAppGrantCallback } from "./grant-callback.js";

it("recognises the consent popup's return, approved or declined, and nothing else", () => {
  expect(isAppGrantCallback(new URL("https://reader.mdbase.dev/?state=s&code=c"))).toBe(true);
  expect(
    isAppGrantCallback(new URL("https://reader.mdbase.dev/?state=s&error=access_denied")),
  ).toBe(true);
  expect(isAppGrantCallback(new URL("https://reader.mdbase.dev/"))).toBe(false);
  expect(isAppGrantCallback(new URL("https://reader.mdbase.dev/?collection=x"))).toBe(false);
  expect(isAppGrantCallback(new URL("https://reader.mdbase.dev/?code=c"))).toBe(false);
});

it("delivers the full return URL to the waiting tab, then closes, even when delivery fails", async () => {
  const url = new URL("http://127.0.0.1:48222/?state=s&code=c");
  const close = vi.fn();
  const deliver = vi.fn();
  expect(completeAppGrantCallback(url, close, deliver)).toBe(true);
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(deliver).toHaveBeenCalledWith(url.href);

  const closeAfterFailure = vi.fn();
  expect(
    completeAppGrantCallback(url, closeAfterFailure, () => Promise.reject(new Error("no channel"))),
  ).toBe(true);
  await vi.waitFor(() => expect(closeAfterFailure).toHaveBeenCalledOnce());

  const untouched = vi.fn();
  expect(completeAppGrantCallback(new URL("http://127.0.0.1:48222/"), untouched, deliver)).toBe(
    false,
  );
  expect(untouched).not.toHaveBeenCalled();
});
