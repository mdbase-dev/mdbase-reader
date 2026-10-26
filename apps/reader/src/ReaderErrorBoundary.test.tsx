// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React work */
import { feedbackApplication, FeedbackProvider } from "@mdbase-dev/ui/feedback";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ReaderErrorBoundary } from "./ReaderErrorBoundary.js";
import { createRoot } from "./testing/i18n.js";

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // React reports caught render errors to the console; the test expects one.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Broken(): never {
  throw new TypeError("Cannot read properties of undefined (reading 'sources')");
}

it("shows a plain message, a reload and the error details when a child throws", async () => {
  const reload = vi.fn();
  await act(async () =>
    root.render(
      <FeedbackProvider
        endpoint={null}
        application={feedbackApplication("mdbase reader", "connection")}
      >
        <ReaderErrorBoundary reload={reload}>
          <Broken />
        </ReaderErrorBoundary>
      </FeedbackProvider>,
    ),
  );

  expect(host.querySelector("h1")?.textContent).toBe("Reader hit a problem and stopped");
  expect(host.querySelector("[role=alert]")?.textContent).toMatch(/Reload to keep reading/u);
  expect(host.querySelector("details summary")?.textContent).toBe("Details");
  expect(host.querySelector("details code")?.textContent).toBe(
    "TypeError: Cannot read properties of undefined (reading 'sources')",
  );
  const button = [...host.querySelectorAll("button")].find(
    ({ textContent }) => textContent === "Reload",
  );
  await act(async () => button?.click());
  expect(reload).toHaveBeenCalledOnce();
});

it("renders its children when nothing throws", async () => {
  await act(async () =>
    root.render(
      <ReaderErrorBoundary>
        <p>Library</p>
      </ReaderErrorBoundary>,
    ),
  );
  expect(host.textContent).toBe("Library");
});
