import { defaultReadingTypography, type ReadingTypography } from "@mdbase-reader/reading-surface";

export type InspectorDock = "right" | "bottom";
export type LibraryPresentation = "compact" | "bibliography" | "grid";

export interface WorkspaceShellPreferences {
  readonly density: "comfortable" | "compact";
  readonly libraryWidth: number;
  readonly inspectorWidth: number;
  readonly inspectorHeight: number;
  readonly inspectorDock: InspectorDock;
  readonly inspectorTab: "annotations" | "note" | "citation";
  readonly libraryPresentation: LibraryPresentation;
  readonly typography: ReadingTypography;
  /** Hide the Sources sidebar while a document has focus, and bring it back for the library. */
  readonly sidebarWhileReading: "hide" | "keep";
}

const defaults: WorkspaceShellPreferences = {
  density: "comfortable",
  libraryWidth: 272,
  inspectorWidth: 340,
  inspectorHeight: 320,
  inspectorDock: "right",
  inspectorTab: "annotations",
  libraryPresentation: "compact",
  typography: defaultReadingTypography,
  sidebarWhileReading: "hide",
};

export function defaultShellPreferences(): WorkspaceShellPreferences {
  return defaults;
}

export function parseShellPreferences(value: unknown): WorkspaceShellPreferences {
  if (typeof value !== "object" || value === null) {
    return defaults;
  }
  const candidate = value as Partial<WorkspaceShellPreferences>;
  return {
    density: candidate.density === "compact" ? "compact" : "comfortable",
    libraryWidth: clamp(candidate.libraryWidth, 220, 420, defaults.libraryWidth),
    inspectorWidth: clamp(candidate.inspectorWidth, 280, 560, defaults.inspectorWidth),
    inspectorHeight: clamp(candidate.inspectorHeight, 220, 520, defaults.inspectorHeight),
    inspectorDock: candidate.inspectorDock === "bottom" ? "bottom" : "right",
    inspectorTab: ["annotations", "note", "citation"].includes(candidate.inspectorTab ?? "")
      ? (candidate.inspectorTab ?? defaults.inspectorTab)
      : defaults.inspectorTab,
    libraryPresentation: ["compact", "bibliography", "grid"].includes(
      candidate.libraryPresentation ?? "",
    )
      ? (candidate.libraryPresentation ?? defaults.libraryPresentation)
      : defaults.libraryPresentation,
    typography: parseTypography(candidate.typography),
    sidebarWhileReading: candidate.sidebarWhileReading === "keep" ? "keep" : "hide",
  };
}

export const typographyScaleSteps = [0.85, 0.92, 1, 1.1, 1.2, 1.32, 1.46] as const;

function parseTypography(value: unknown): ReadingTypography {
  if (typeof value !== "object" || value === null) {
    return defaultReadingTypography;
  }
  const candidate = value as Partial<ReadingTypography>;
  return {
    scale: clamp(candidate.scale, 0.8, 1.6, defaultReadingTypography.scale),
    measure:
      candidate.measure === "narrow" || candidate.measure === "wide"
        ? candidate.measure
        : "standard",
    face: candidate.face === "sans" ? "sans" : "serif",
  };
}

export function snapPanelSize(value: number, points: readonly number[], threshold = 14): number {
  return points.find((point) => Math.abs(point - value) <= threshold) ?? value;
}

export function workspaceShellStyle(
  preferences: WorkspaceShellPreferences,
): Record<string, string> {
  return {
    "--reader-library-width": `${String(preferences.libraryWidth)}px`,
    "--reader-inspector-width": `${String(preferences.inspectorWidth)}px`,
  };
}

function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}
