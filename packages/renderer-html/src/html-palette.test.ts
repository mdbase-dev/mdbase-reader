// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { followEmbedderPalette } from "./html-palette.js";

afterEach(() => {
  document.body.replaceChildren();
  document.head.replaceChildren();
  document.documentElement.removeAttribute("data-theme");
});

const lightApp = `:root { color-scheme: light; } iframe { color: rgb(20, 24, 30); background-color: rgb(252, 253, 255); }`;
const darkApp = `:root { color-scheme: dark; } iframe { color: rgb(225, 229, 234); background-color: rgb(17, 21, 26); }`;

function framedPage(): { readonly frame: HTMLIFrameElement; readonly app: HTMLStyleElement } {
  const app = document.createElement("style");
  app.textContent = lightApp;
  document.head.append(app);
  const frame = document.createElement("iframe");
  document.body.append(frame);
  return { frame, app };
}

function paletteRule(frame: HTMLIFrameElement): string {
  return (
    frame.contentDocument?.querySelector("style[data-mdbase-reader='palette']")?.textContent ?? ""
  );
}

describe("followEmbedderPalette", () => {
  it("gives the page the frame's colours and follows a theme change on the app root", async () => {
    const { frame, app } = framedPage();
    const stop = followEmbedderPalette(frame);

    expect(paletteRule(frame)).toContain("color-scheme: light");
    expect(paletteRule(frame)).toContain("background: rgb(252, 253, 255)");
    expect(paletteRule(frame)).toContain("color: rgb(20, 24, 30)");
    expect(frame.contentDocument?.documentElement.dataset["readerScheme"]).toBe("light");

    // happy-dom does not restyle descendants when a root attribute changes, so the app's
    // stylesheet switches with the attribute a browser would restyle from.
    app.textContent = darkApp;
    document.documentElement.dataset["theme"] = "dark";
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(paletteRule(frame)).toContain("color-scheme: dark");
    expect(paletteRule(frame)).toContain("background: rgb(17, 21, 26)");
    expect(frame.contentDocument?.documentElement.dataset["readerScheme"]).toBe("dark");

    stop();
    delete document.documentElement.dataset["theme"];
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(paletteRule(frame)).toContain("color-scheme: dark");
  });
});
