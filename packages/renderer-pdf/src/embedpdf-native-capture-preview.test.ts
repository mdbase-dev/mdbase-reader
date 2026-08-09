import { describe, expect, it, vi } from "vitest";

import { capturePreviewCloseButton } from "./embedpdf-native-capture-preview.js";

describe("capturePreviewCloseButton", () => {
  it("finds only the close button belonging to EmbedPDF's capture preview", () => {
    const close = { click: vi.fn() } as unknown as HTMLButtonElement;
    const dialog = {
      querySelector: vi.fn().mockReturnValue(close),
    } as unknown as HTMLElement;
    const preview = {
      closest: vi.fn().mockReturnValue(dialog),
    } as unknown as HTMLImageElement;
    const root = {
      querySelector: vi.fn().mockReturnValue(preview),
    } as unknown as ParentNode;

    expect(capturePreviewCloseButton(root)).toBe(close);
    expect(root.querySelector).toHaveBeenCalledWith('img[alt="Captured PDF area"]');
    expect(preview.closest).toHaveBeenCalledWith(".fixed.inset-0");
    expect(dialog.querySelector).toHaveBeenCalledWith("button");
  });

  it("does not close unrelated EmbedPDF dialogs", () => {
    const root = {
      querySelector: vi.fn().mockReturnValue(null),
    } as unknown as ParentNode;

    expect(capturePreviewCloseButton(root)).toBeNull();
  });
});
