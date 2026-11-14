// @vitest-environment happy-dom
import { act } from "react";
import { expect, it, vi } from "vitest";

import { useSdkConnectionState } from "./sdk-connection-state.js";
import { createRoot } from "./testing/i18n.js";

import type { Mdbase } from "@mdbase-reader/connect/native";
import type { JSX } from "react";

it("follows SDK connectivity changes without waiting for a record write", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let snapshot = { sync: { state: "saved" } };
  let changed: () => void = () => undefined;
  const mdbase = {
    subscribe: (listener: () => undefined) => {
      changed = listener;
      return () => undefined;
    },
    getSnapshot: () => snapshot,
  } as unknown as Mdbase;
  function Status(): JSX.Element {
    return <output>{useSdkConnectionState(mdbase, "connected")}</output>;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    act(() => root.render(<Status />));
    expect(host.textContent).toBe("connected");
    snapshot = { sync: { state: "offline" } };
    act(() => {
      changed();
    });
    expect(host.textContent).toBe("offline");
    snapshot = { sync: { state: "saved" } };
    act(() => {
      changed();
    });
    expect(host.textContent).toBe("connected");
  } finally {
    act(() => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
