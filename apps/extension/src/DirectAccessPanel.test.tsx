// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React updates */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

import { DirectAccessPanel, localConnectorPermission } from "./DirectAccessPanel.js";

import type { ReaderDirectAccessController } from "@mdbase-reader/connect";

it("requires explicit host approval followed by a user-gesture SDK request, preserving relay on denial", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const permission = vi.fn(() => Promise.resolve(true));
  vi.stubGlobal("chrome", {
    permissions: { contains: () => Promise.resolve(false), request: permission },
  });
  const snapshot = {
    authority: "connector",
    route: "relay",
    status: "permission_required",
  } as const;
  const request = vi.fn(() => Promise.resolve({ ok: true, value: "denied", diagnostics: [] }));
  const disable = vi.fn();
  const onUnavailable = vi.fn(() => Promise.resolve());
  const controller = {
    disable,
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    request,
    check: vi.fn(),
  } as unknown as ReaderDirectAccessController;
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(
        <DirectAccessPanel controller={controller} busy={false} onUnavailable={onUnavailable} />,
      );
    });
    expect(request).not.toHaveBeenCalled();
    expect(permission).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Allow local connector access");
    await act(async () => {
      host.querySelector("button")!.click();
    });
    expect(permission).toHaveBeenCalledWith(localConnectorPermission());
    expect(localConnectorPermission()).toEqual({ origins: ["http://127.0.0.1/*"] });
    expect(request).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Connect directly");
    await act(async () => {
      host.querySelector("button")!.click();
      expect(request).toHaveBeenCalledOnce(); // synchronous in the click, not a later effect
    });
    expect(host.textContent).toContain("The relay is still available");
    expect(disable).toHaveBeenCalledOnce();
    expect(onUnavailable).toHaveBeenCalledOnce();
  } finally {
    await act(async () => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  }
});
