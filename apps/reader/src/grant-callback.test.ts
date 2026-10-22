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

it("delivers without preempting the original SDK popup lifetime, including failed delivery", async () => {
  const url = new URL("http://127.0.0.1:48222/?state=s&code=c");
  const close = vi.fn();
  vi.stubGlobal("window", { close });
  const deliver = vi.fn();
  expect(completeAppGrantCallback(url, deliver)).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(close).not.toHaveBeenCalled();
  expect(deliver).toHaveBeenCalledWith(url.href);

  expect(completeAppGrantCallback(url, () => Promise.reject(new Error("no channel")))).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(close).not.toHaveBeenCalled();

  expect(completeAppGrantCallback(new URL("http://127.0.0.1:48222/"), deliver)).toBe(false);
  expect(close).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
