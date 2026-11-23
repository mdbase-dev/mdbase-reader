import { defaultReadingTypography, type ReadingTypography } from "@mdbase-reader/reading-surface";

export interface WorkspaceShellPreferences {
  readonly density: "comfortable" | "compact";
  readonly typography: ReadingTypography;
}

const defaults: WorkspaceShellPreferences = {
  density: "comfortable",
  typography: defaultReadingTypography,
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
    typography: parseTypography(candidate.typography),
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

function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}
