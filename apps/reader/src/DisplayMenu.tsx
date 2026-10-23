import { Trans, useLingui } from "@lingui/react/macro";
import { themePreferences, type ThemePreference } from "@mdbase-dev/ui/theme";
import { ReaderLanguageSetting } from "@mdbase-reader/i18n/react";

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
  const { t } = useLingui();
  const highlightOnSelect = useHighlightOnSelect();
  return (
    <Menu
      className="header-display-menu"
      label={t({ message: "Display settings", context: "DisplayMenu interface" })}
      title={t({ message: "Text and display" })}
      triggerClassName="icon-button header-display-trigger"
      trigger={<span aria-hidden="true">Aa</span>}
    >
      <ReaderLanguageSetting />
      {typography && onChangeTypography ? (
        <TypographyControls value={typography} onChange={onChangeTypography} />
      ) : null}
      <DisplayChoice
        legend={t({ message: "Theme", context: "DisplayMenu interface" })}
        value={theme}
        options={themePreferences.map((value) => ({
          value,
          label: value === "dark" ? t`Dark` : value === "light" ? t`Light` : t`System`,
        }))}
        onChange={onChangeTheme}
      />
      {onChangeDensity ? (
        <DisplayChoice
          legend={t({ message: "Density", context: "DisplayMenu interface" })}
          value={density}
          options={[
            {
              value: "comfortable",
              label: t({ message: "Comfortable", context: "DisplayMenu interface" }),
            },
            {
              value: "compact",
              label: t({ message: "Compact", context: "DisplayMenu interface" }),
            },
          ]}
          onChange={onChangeDensity}
        />
      ) : null}
      {onChangeSidebarWhileReading ? (
        <DisplayChoice
          legend={t({ message: "Sidebar while reading" })}
          value={sidebarWhileReading}
          options={[
            { value: "hide", label: t({ message: "Hide", context: "DisplayMenu interface" }) },
            { value: "keep", label: t({ message: "Keep open", context: "DisplayMenu interface" }) },
          ]}
          onChange={onChangeSidebarWhileReading}
        />
      ) : null}
      <DisplayChoice
        legend={t({ message: "Selecting text", context: "DisplayMenu interface" })}
        value={highlightOnSelect}
        options={[
          {
            value: "offer",
            label: t({ message: "Show actions", context: "DisplayMenu interface" }),
          },
          { value: "instant", label: t({ message: "Highlight at once" }) },
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
  const { t } = useLingui();
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
        <legend>
          <Trans>Text size</Trans>
        </legend>
        <div className="text-size-stepper">
          <button
            type="button"
            aria-label={t({ message: "Smaller text", context: "DisplayMenu interface" })}
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
            aria-label={t({ message: "Larger text", context: "DisplayMenu interface" })}
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
        legend={t({ message: "Line length", context: "DisplayMenu interface" })}
        value={value.measure}
        options={[
          { value: "narrow", label: t({ message: "Narrow", context: "DisplayMenu interface" }) },
          {
            value: "standard",
            label: t({ message: "Standard", context: "DisplayMenu interface" }),
          },
          { value: "wide", label: t({ message: "Wide", context: "DisplayMenu interface" }) },
        ]}
        onChange={(measure) => onChange({ ...value, measure })}
      />
      <DisplayChoice
        legend={t({ message: "Typeface", context: "DisplayMenu interface" })}
        value={value.face}
        options={[
          { value: "serif", label: t({ message: "Serif", context: "DisplayMenu interface" }) },
          { value: "sans", label: t({ message: "Sans", context: "DisplayMenu interface" }) },
        ]}
        onChange={(face) => onChange({ ...value, face })}
      />
      <p className="display-note">
        <Trans>Applies to EPUBs and saved web pages. PDFs keep their layout.</Trans>
      </p>
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
