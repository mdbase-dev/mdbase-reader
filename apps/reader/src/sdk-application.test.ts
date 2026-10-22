// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://reader.mdbase.dev/"}
import { createReaderMdbase, type Mdbase } from "@mdbase-reader/connect/native";
import { afterEach, expect, it, vi } from "vitest";

import manifest from "./generated/mdbase-app.json";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function readerSdk(): Promise<() => Mdbase> {
  return (await import("./sdk-application.js")).readerSdk;
}

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

it("selects the native entry for production with the production environment", async () => {
  vi.stubEnv("VITE_MDBASE_ENV", "production");
  // Present but never used: construction must not allocate a Worker or channel.
  vi.stubGlobal(
    "Worker",
    vi.fn(() => {
      throw new Error("No test Worker allocation");
    }),
  );
  vi.stubGlobal(
    "MessageChannel",
    vi.fn(() => {
      throw new Error("No test channel allocation");
    }),
  );
  // The committed bundled manifest declares the production origin.
  const entry = (await readerSdk())();
  expect(entry.getSnapshot().status).toBe("not_started");
  await entry.close();
});

it("never retargets a staging build onto the bundled production manifest", async () => {
  vi.stubEnv("VITE_MDBASE_ENV", "staging");
  await expect(async () => (await readerSdk())()).rejects.toThrow(/staging/u);
});

it("refuses an unknown build environment instead of choosing an entry", async () => {
  vi.stubEnv("VITE_MDBASE_ENV", "qa");
  await expect(async () => (await readerSdk())()).rejects.toThrow(/Unsupported/u);
});
