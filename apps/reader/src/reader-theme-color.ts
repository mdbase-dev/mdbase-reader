import { resolveDarkTheme } from "@mdbase-dev/ui/theme";

/**
 * Browser chrome colours matching Reader's warm canvas (`--bg-canvas` in
 * @mdbase-reader/ui/tokens.css), which replace the shared palette's cooler defaults.
 */
export const readerThemeColors = { light: "#f7f4f0", dark: "#100e0c" } as const;

/** Point the theme-color meta at the canvas of the theme the root resolves to. */
export function applyReaderThemeColor(root: HTMLElement = document.documentElement): void {
  const color = resolveDarkTheme(root) ? readerThemeColors.dark : readerThemeColors.light;
  root.ownerDocument.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}
