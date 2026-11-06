// @vitest-environment happy-dom
import { act } from "react";
import { expect, it, vi } from "vitest";

import { useSdkConnectionState } from "./sdk-connection-state.js";
import { createRoot } from "./testing/i18n.js";

import type { Mdbase } from "@mdbase-reader/connect/native";
import type { JSX } from "react";

it("reports browser offline immediately and recovers without an SDK write", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  const mdbase = {
    subscribe: () => () => undefined,
    getSnapshot: () => null,
  } as unknown as Mdbase;
  function Status(): JSX.Element {
    return <output>{useSdkConnectionState(mdbase, "connected")}</output>;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    act(() => root.render(<Status />));
    expect(host.textContent).toBe("connected");
    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(host.textContent).toBe("offline");
    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(host.textContent).toBe("connected");
  } finally {
    act(() => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
