// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://reader.mdbase.dev/"}
import { createReaderMdbase } from "@mdbase-reader/connect/native";
import { afterEach, expect, it, vi } from "vitest";

import manifest from "./generated/mdbase-app.json";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("constructs the live entry on its own origin without IO and leaves the phase to start()", async () => {
  // Present but never used: construction must not allocate a Worker or channel.
  const worker = vi.fn(() => {
    throw new Error("No test Worker allocation");
  });
  const channel = vi.fn(() => {
    throw new Error("No test channel allocation");
  });
  vi.stubGlobal("Worker", worker);
  vi.stubGlobal("MessageChannel", channel);
  const entry = createReaderMdbase({ environment: "lab", manifest });
  expect(entry.getSnapshot().status).toBe("not_started");
  expect(worker).not.toHaveBeenCalled();
  expect(channel).not.toHaveBeenCalled();
  await entry.close();
});
