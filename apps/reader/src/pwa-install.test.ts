// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { markPwaInstallEligible, setupPwaInstall } from "./pwa-install.js";

let stop: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function offerInstall(): Event {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe("Reader install engagement", () => {
  it("retains the browser offer but waits for a document and a further delay", () => {
    stop = setupPwaInstall("Reader");
    expect(offerInstall().defaultPrevented).toBe(true);
    vi.advanceTimersByTime(120_000);
    expect(document.querySelector(".pwa-install")).toBeNull();
    markPwaInstallEligible();
    vi.advanceTimersByTime(29_999);
    expect(document.querySelector(".pwa-install")).toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.querySelector(".pwa-install")).not.toBeNull();
  });

  it("allows an invitation on a later visit after document use", () => {
    markPwaInstallEligible();
    stop = setupPwaInstall("Reader");
    offerInstall();
    vi.advanceTimersByTime(30_000);
    expect(document.querySelector(".pwa-install")).not.toBeNull();
  });

  it("honours dismissal across further document opens and visits", () => {
    stop = setupPwaInstall("Reader");
    offerInstall();
    markPwaInstallEligible();
    vi.advanceTimersByTime(30_000);
    const later = [...document.querySelectorAll<HTMLButtonElement>(".pwa-install button")].find(
      (button) => button.textContent === "Not now",
    );
    later?.click();
    stop();
    stop = setupPwaInstall("Reader");
    markPwaInstallEligible();
    offerInstall();
    vi.advanceTimersByTime(30_000);
    expect(document.querySelector(".pwa-install")).toBeNull();
  });

  it("cleans up the engagement listener and pending delay", () => {
    stop = setupPwaInstall("Reader");
    offerInstall();
    markPwaInstallEligible();
    stop();
    markPwaInstallEligible();
    vi.advanceTimersByTime(30_000);
    expect(document.querySelector(".pwa-install")).toBeNull();
  });
});
