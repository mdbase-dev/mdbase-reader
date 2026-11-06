// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { createRoot } from "./testing/i18n.js";
import { useRovingControls } from "./use-roving-controls.js";

import type { JSX } from "react";

let root: ReturnType<typeof createRoot>;
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function Controls(): JSX.Element {
  const ref = useRovingControls();
  return (
    <div ref={ref}>
      <button>First</button>
      <button disabled>Unavailable</button>
      <details>
        <summary>Menu</summary>
        <div className="reader-menu-panel">
          <button>Item</button>
        </div>
      </details>
      <button>Last</button>
    </div>
  );
}

it("keeps one toolbar stop and leaves open menu navigation to the menu", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Controls />));
  const first = host.querySelector("button");
  const summary = host.querySelector("summary");
  const last = Array.from(host.querySelectorAll("button")).at(-1);
  first?.focus();
  first?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  expect(document.activeElement).toBe(summary);
  expect(first?.tabIndex).toBe(-1);
  expect(summary?.tabIndex).toBe(0);
  const details = host.querySelector("details");
  details?.setAttribute("open", "");
  summary?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  expect(document.activeElement).toBe(summary);
  details?.removeAttribute("open");
  summary?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
  expect(document.activeElement).toBe(last);
  last?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  expect(document.activeElement).toBe(first);
  expect(host.querySelector(".reader-menu-panel button")?.getAttribute("tabindex")).toBeNull();
});
