import { FeedbackButton } from "@mdbase-dev/ui/feedback";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

import { FeedbackRoot } from "./FeedbackRoot.js";

afterEach(() => vi.unstubAllEnvs());

it("hides unconfigured feedback without hiding the Reader shell", () => {
  vi.stubEnv("VITE_MDBASE_FEEDBACK_URL", "");
  const markup = renderToStaticMarkup(
    <FeedbackRoot>
      <p>Reader shell</p>
      <FeedbackButton />
    </FeedbackRoot>,
  );
  expect(markup).toContain("Reader shell");
  expect(markup).not.toContain("Send feedback");
});

it("uses the shared entry and excludes unsafe destinations", () => {
  for (const endpoint of ["https://feedback.example/v1/feedback", "javascript:alert(1)"]) {
    vi.stubEnv("VITE_MDBASE_FEEDBACK_URL", endpoint);
    const markup = renderToStaticMarkup(
      <FeedbackRoot>
        <FeedbackButton />
      </FeedbackRoot>,
    );
    expect(markup.includes("Send feedback")).toBe(endpoint.startsWith("https:"));
    expect(markup).not.toContain("HELP US MAKE IT BETTER");
  }
});
