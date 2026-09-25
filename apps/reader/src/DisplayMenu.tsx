import { themePreferences, type ThemePreference } from "@mdbase-reader/ui";

import { setHighlightOnSelect, useHighlightOnSelect } from "./highlight-preference.js";
import { Menu } from "./Menu.js";
import { typographyScaleSteps } from "./workspace-shell-preferences.js";

import type { ReadingTypography } from "@mdbase-reader/reading-surface";
import type { JSX } from "react";

/** Text, theme and layout choices behind the header's "Aa" button. */
export function DisplayMenu({
  theme,
  onChangeTheme,
  typography,
  onChangeTypography,
  density,
  onChangeDensity,
  sidebarWhileReading,
  onChangeSidebarWhileReading,
}: {
  readonly theme: ThemePreference;
  readonly onChangeTheme: (theme: ThemePreference) => void;
  readonly typography?: ReadingTypography;
  readonly onChangeTypography?: (typography: ReadingTypography) => void;
  readonly density: "comfortable" | "compact";
  readonly onChangeDensity?: (density: "comfortable" | "compact") => void;
  readonly sidebarWhileReading: "hide" | "keep";
  readonly onChangeSidebarWhileReading?: (value: "hide" | "keep") => void;
}): JSX.Element {
  const highlightOnSelect = useHighlightOnSelect();
  return (
    <Menu
      className="header-display-menu"
      label="Display settings"
      title="Text and display"
      triggerClassName="icon-button header-display-trigger"
      trigger={<span aria-hidden="true">Aa</span>}
    >
      {typography && onChangeTypography ? (
        <TypographyControls value={typography} onChange={onChangeTypography} />
      ) : null}
      <DisplayChoice
        legend="Theme"
        value={theme}
        options={themePreferences.map((value) => ({ value, label: capitalize(value) }))}
        onChange={onChangeTheme}
      />
      {onChangeDensity ? (
        <DisplayChoice
          legend="Density"
          value={density}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ]}
          onChange={onChangeDensity}
        />
      ) : null}
      {onChangeSidebarWhileReading ? (
        <DisplayChoice
          legend="Sidebar while reading"
          value={sidebarWhileReading}
          options={[
            { value: "hide", label: "Hide" },
            { value: "keep", label: "Keep open" },
          ]}
          onChange={onChangeSidebarWhileReading}
        />
      ) : null}
      <DisplayChoice
        legend="Selecting text"
        value={highlightOnSelect}
        options={[
          { value: "offer", label: "Show actions" },
          { value: "instant", label: "Highlight at once" },
        ]}
        onChange={setHighlightOnSelect}
      />
    </Menu>
  );
}

function DisplayChoice<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  readonly legend: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
}): JSX.Element {
  return (
    <fieldset className="display-choice" data-menu-keep-open>
      <legend>{legend}</legend>
      <div className="segmented-control">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function TypographyControls({
  value,
  onChange,
}: {
  readonly value: ReadingTypography;
  readonly onChange: (typography: ReadingTypography) => void;
}): JSX.Element {
  const index = nearestStep(value.scale);
  const step = (direction: -1 | 1): void => {
    const next = typographyScaleSteps[index + direction];
    if (next !== undefined) {
      onChange({ ...value, scale: next });
    }
  };
  return (
    <>
      <fieldset className="display-choice display-text-size" data-menu-keep-open>
        <legend>Text size</legend>
        <div className="text-size-stepper">
          <button
            type="button"
            aria-label="Smaller text"
            disabled={index === 0}
            onClick={() => step(-1)}
          >
            <span aria-hidden="true" className="is-small">
              A
            </span>
          </button>
          <output aria-live="polite">{Math.round(value.scale * 100)}%</output>
          <button
            type="button"
            aria-label="Larger text"
            disabled={index === typographyScaleSteps.length - 1}
            onClick={() => step(1)}
          >
            <span aria-hidden="true" className="is-large">
              A
            </span>
          </button>
        </div>
      </fieldset>
      <DisplayChoice
        legend="Line length"
        value={value.measure}
        options={[
          { value: "narrow", label: "Narrow" },
          { value: "standard", label: "Standard" },
          { value: "wide", label: "Wide" },
        ]}
        onChange={(measure) => onChange({ ...value, measure })}
      />
      <DisplayChoice
        legend="Typeface"
        value={value.face}
        options={[
          { value: "serif", label: "Serif" },
          { value: "sans", label: "Sans" },
        ]}
        onChange={(face) => onChange({ ...value, face })}
      />
      <p className="display-note">Applies to EPUBs and saved web pages. PDFs keep their layout.</p>
    </>
  );
}

function nearestStep(scale: number): number {
  let best = 0;
  typographyScaleSteps.forEach((step, index) => {
    if (Math.abs(step - scale) < Math.abs((typographyScaleSteps[best] ?? 1) - scale)) {
      best = index;
    }
  });
  return best;
}

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}
