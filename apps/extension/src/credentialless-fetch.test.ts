import { expect, it, vi } from "vitest";

import { credentiallessFetch } from "./credentialless-fetch.js";

it("omits portal cookies without dropping signed grant authorization or request options", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
  const signal = new AbortController().signal;
  await credentiallessFetch(fetcher)("https://connect-lab.mdbase.dev/v1/apps/register", {
    method: "POST",
    credentials: "include",
    headers: { Authorization: "Bearer test-grant" },
    body: "{}",
    signal,
  });
  expect(fetcher).toHaveBeenCalledWith(expect.any(String), {
    method: "POST",
    credentials: "omit",
    headers: { Authorization: "Bearer test-grant" },
    body: "{}",
    signal,
  });
});
