export type InspectorDock = "right" | "bottom";
export type LibraryPresentation = "compact" | "bibliography" | "grid";

export interface WorkspaceShellPreferences {
  readonly libraryWidth: number;
  readonly inspectorWidth: number;
  readonly inspectorHeight: number;
  readonly inspectorDock: InspectorDock;
  readonly inspectorTab: "annotations" | "note" | "citation";
  readonly libraryPresentation: LibraryPresentation;
}

const defaults: WorkspaceShellPreferences = {
  libraryWidth: 272,
  inspectorWidth: 340,
  inspectorHeight: 320,
  inspectorDock: "right",
  inspectorTab: "annotations",
  libraryPresentation: "compact",
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
  };
}

export function snapPanelSize(value: number, points: readonly number[], threshold = 14): number {
  return points.find((point) => Math.abs(point - value) <= threshold) ?? value;
}

function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}
