// @vitest-environment happy-dom
import { describeError } from "@mdbase-reader/connect/native";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { connectionView } from "./connection-view.js";
import { ConnectionPanel, type ConnectionControls } from "./ConnectionPanel.js";
import { applicationFixture } from "./testing/sdk-fixture.js";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const owned: { close(): void }[] = [];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
  for (const controls of owned.splice(0)) {
    controls.close();
  }
  vi.unstubAllGlobals();
});

async function renderAndApprove(
  h: ReturnType<typeof applicationFixture>,
  copy: ReturnType<typeof describeError>,
): Promise<void> {
  owned.push(h.controls);
  const application = h.entry.application();
  const scope = new AbortController();
  const approve = async (): Promise<void> => {
    await application.approve(undefined, { signal: scope.signal });
  };
  const controller: ConnectionControls = {
    snapshot: connectionView(application.getSnapshot(), false),
    busy: true,
    connect: approve,
    retry: approve,
    applySetup: async () => {
      await application.configure({ signal: scope.signal });
    },
    select: (id) => {
      void application.select(id, { signal: scope.signal });
    },
  };
  await act(async () => {
    root.render(<ConnectionPanel controller={controller} />);
    await Promise.resolve();
  });
  if (copy) {
    expect(host.textContent).toContain(copy.title);
    expect(host.textContent).toContain(copy.message);
  }
  const label = copy?.actionLabel ?? "Sign in";
  const button = [...host.querySelectorAll("button")].find((item) => item.textContent === label);
  if (!button) {
    throw new Error("Missing SDK sign-in action");
  }
  expect(button.disabled).toBe(false);
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
  expect(h.controls.observedActions().filter((call) => call.action === "approve")).toHaveLength(1);
  expect(h.controls.observedActions().filter((call) => call.action === "authorize")).toHaveLength(
    0,
  );
  scope.abort();
}

for (const status of ["blocked", "authorizing"] as const) {
  for (const code of ["refused", "expired"] as const) {
    it(`${status}/${code} keeps SDK copy and an enabled approval gesture`, async () => {
      const h = applicationFixture({ status, problem: code });
      const copy = describeError(h.entry.application().getSnapshot());
      if (!copy?.actionLabel) {
        throw new Error("Missing public SDK sign-in description");
      }
      await renderAndApprove(h, copy);
    });
  }
}

it("authorizing without a problem still offers enabled Sign in", async () => {
  await renderAndApprove(applicationFixture({ status: "authorizing" }), null);
});
