import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

import { OptionsApp } from "./OptionsApp.js";
import { WelcomeApp } from "./WelcomeApp.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubManifest(): void {
  vi.stubGlobal("chrome", {
    runtime: { getManifest: () => ({ version: "0.2.0", version_name: "0.2.0-beta.1" }) },
  });
}

it("gathers collection, saved-page marks, shortcuts and version on the settings page", () => {
  stubManifest();
  const html = renderToStaticMarkup(<OptionsApp />);
  expect(html).toContain("Collection");
  expect(html).toContain("Connect a collection");
  expect(html).toContain("Mark pages I’ve saved");
  expect(html).toContain("Keyboard shortcuts");
  expect(html).toContain("Change keyboard shortcuts");
  expect(html).toContain("0.2.0-beta.1");
});

it("walks a new user through connecting, pinning, saving and highlighting", () => {
  stubManifest();
  const html = renderToStaticMarkup(<WelcomeApp />);
  expect(html).toContain("mdbase Reader is installed");
  for (const step of [
    "Connect a collection",
    "Pin the extension",
    "Save what you are reading",
    "Highlight passages",
  ]) {
    expect(html).toContain(step);
  }
  expect(html).toContain("Settings");
});
