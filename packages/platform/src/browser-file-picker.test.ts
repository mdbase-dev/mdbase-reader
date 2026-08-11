// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { pickBrowserFile } from "./browser-file-picker.js";

describe("browser file picker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("keeps the chooser input attached until a selected file has been read", async () => {
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    const result = pickBrowserFile([".pdf", "application/epub+zip"]);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input?.accept).toBe(".pdf,application/epub+zip");
    const file = new File([new TextEncoder().encode("reader")], "reading.epub", {
      type: "application/epub+zip",
    });
    Object.defineProperty(input, "files", { value: [file] });
    input?.dispatchEvent(new Event("change"));

    await expect(result).resolves.toMatchObject({
      name: "reading.epub",
      mediaType: "application/epub+zip",
      size: 6,
    });
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("resolves cancellation and removes its temporary input", async () => {
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    const result = pickBrowserFile([".pdf"]);
    document
      .querySelector<HTMLInputElement>('input[type="file"]')
      ?.dispatchEvent(new Event("cancel"));

    await expect(result).resolves.toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});
