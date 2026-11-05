// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { OverlayPresence } from "./OverlayPresence.js";
import { createRoot } from "./testing/i18n.js";

const host = document.createElement("div");
document.body.append(host);
const root = createRoot(host);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function completion(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason: Error) => void;
} {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.render(null);
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("retains the closing content until its actual animation finishes", async () => {
  await act(async () => {
    await Promise.resolve();
    return root.render(
      <OverlayPresence open>
        <div>Open</div>
      </OverlayPresence>,
    );
  });
  class Effect {
    target = host.querySelector(".reader-overlay")!.firstElementChild;
  }
  vi.stubGlobal("KeyframeEffect", Effect);
  const finished = completion();
  vi.spyOn(Element.prototype, "getAnimations").mockReturnValue([
    { effect: new Effect(), finished: finished.promise } as unknown as Animation,
  ]);
  await act(async () => {
    await Promise.resolve();
    root.render(<OverlayPresence open={false}>{null}</OverlayPresence>);
  });
  expect(host.textContent).toBe("Open");
  expect(host.querySelector(".reader-overlay")?.getAttribute("data-state")).toBe("closed");
  await act(async () => {
    await Promise.resolve();
    finished.resolve();
  });
  expect(host.textContent).toBe("");
});

it("does not remove a reopened overlay when the interrupted exit settles", async () => {
  await act(async () => {
    await Promise.resolve();
    return root.render(
      <OverlayPresence open>
        <div>Open</div>
      </OverlayPresence>,
    );
  });
  const element = host.firstElementChild?.firstElementChild;
  class Effect {
    target = element;
  }
  vi.stubGlobal("KeyframeEffect", Effect);
  const finished = completion();
  vi.spyOn(Element.prototype, "getAnimations").mockReturnValue([
    { effect: new Effect(), finished: finished.promise } as unknown as Animation,
  ]);
  await act(async () => {
    await Promise.resolve();
    root.render(<OverlayPresence open={false}>{null}</OverlayPresence>);
  });
  await act(async () => {
    await Promise.resolve();
    return root.render(
      <OverlayPresence open>
        <div>Reopened</div>
      </OverlayPresence>,
    );
  });
  await act(async () => {
    await Promise.resolve();
    finished.reject(new Error("cancelled"));
  });
  expect(host.firstElementChild?.firstElementChild).toBe(element);
  expect(host.textContent).toBe("Reopened");
});

it("removes a static overlay without an animation timeout", async () => {
  await act(async () => {
    await Promise.resolve();
    return root.render(
      <OverlayPresence open>
        <div>Open</div>
      </OverlayPresence>,
    );
  });
  await act(async () => {
    await Promise.resolve();
    root.render(<OverlayPresence open={false}>{null}</OverlayPresence>);
  });
  expect(host.textContent).toBe("");
});
