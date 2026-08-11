import type { ThemeConfig } from "@embedpdf/react-pdf-viewer";

const mdbaseThemeColors: NonNullable<ThemeConfig["light"]> = {
  background: {
    app: "var(--color-canvas)",
    surface: "var(--color-surface)",
    surfaceAlt: "var(--color-surface-subtle)",
    elevated: "var(--color-surface)",
    overlay: "var(--color-scrim)",
    input: "var(--color-surface-subtle)",
  },
  foreground: {
    primary: "var(--color-text)",
    secondary: "var(--color-text-soft)",
    muted: "var(--color-text-muted)",
    disabled: "var(--color-text-faint)",
    onAccent: "var(--color-surface)",
  },
  border: {
    default: "var(--color-border)",
    subtle: "var(--color-border)",
    strong: "var(--color-border-strong)",
  },
  accent: {
    primary: "var(--color-accent)",
    primaryHover: "var(--color-accent-strong)",
    primaryActive: "var(--color-accent-strong)",
    primaryLight: "var(--color-selected)",
    primaryForeground: "var(--color-surface)",
  },
  interactive: {
    hover: "var(--color-surface-subtle)",
    active: "var(--color-selected)",
    selected: "var(--color-selected)",
    focus: "var(--color-accent)",
    focusRing: "var(--color-selected)",
  },
  state: {
    error: "var(--color-danger)",
    errorLight: "var(--color-surface-subtle)",
    warning: "var(--color-warning)",
    warningLight: "var(--color-surface-subtle)",
    success: "var(--color-success)",
    successLight: "var(--color-surface-subtle)",
    info: "var(--color-accent)",
    infoLight: "var(--color-selected)",
  },
  scrollbar: {
    track: "var(--color-surface-subtle)",
    thumb: "var(--color-border-strong)",
    thumbHover: "var(--color-text-muted)",
  },
  tooltip: {
    background: "var(--color-text)",
    foreground: "var(--color-surface)",
  },
};

/** Both modes resolve the live mdbase tokens inherited by the shadow host. */
export const readerPdfTheme = {
  preference: "system",
  light: mdbaseThemeColors,
  dark: mdbaseThemeColors,
} satisfies ThemeConfig;
