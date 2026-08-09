import { describe, expect, it, vi } from "vitest";

import { capturePreviewCloseButton } from "./embedpdf-native-capture-preview.js";

describe("capturePreviewCloseButton", () => {
  it("finds only the close button belonging to EmbedPDF's capture preview", () => {
    const close = { click: vi.fn() } as unknown as HTMLButtonElement;
    const dialogQuery = vi.fn().mockReturnValue(close);
    const dialog = {
      querySelector: dialogQuery,
    } as unknown as HTMLElement;
    const preview = {
      closest: vi.fn().mockReturnValue(dialog),
    } as unknown as HTMLImageElement;
    const rootQuery = vi.fn().mockReturnValue(preview);
    const root = {
      querySelector: rootQuery,
    } as unknown as ParentNode;

    expect(capturePreviewCloseButton(root)).toBe(close);
    expect(rootQuery).toHaveBeenCalledWith('img[alt="Captured PDF area"]');
    expect(preview.closest).toHaveBeenCalledWith(".fixed.inset-0");
    expect(dialogQuery).toHaveBeenCalledWith("button");
  });

  it("does not close unrelated EmbedPDF dialogs", () => {
    const root = {
      querySelector: vi.fn().mockReturnValue(null),
    } as unknown as ParentNode;

    expect(capturePreviewCloseButton(root)).toBeNull();
  });
});
