import { t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { themePreferences, type ThemePreference } from "@mdbase-dev/ui/theme";
import { ReaderLanguageSetting } from "@mdbase-reader/i18n/react";

import {
  setAnnotationOwnerPreference,
  useAnnotationOwnerPreference,
} from "./annotation-owner-preference.js";
import { setHighlightOnSelect, useHighlightOnSelect } from "./highlight-preference.js";
import { typographyScaleSteps } from "./workspace-shell-preferences.js";

import type { ReadingTypography } from "@mdbase-reader/reading-surface";
import type { JSX } from "react";

/**
 * How a document reads on this device: text size, line length, typeface and theme. Behind the
 * header's "Aa" button, and nowhere else. Everything else about this device is in Settings.
 */
export function DisplaySettings({
  theme,
  onChangeTheme,
  typography,
  onChangeTypography,
  onOpenSettings,
}: {
  readonly theme: ThemePreference;
  readonly onChangeTheme: (theme: ThemePreference) => void;
  readonly typography?: ReadingTypography;
  readonly onChangeTypography?: (typography: ReadingTypography) => void;
  readonly onOpenSettings?: () => void;
}): JSX.Element {
  useLocale();
  return (
    <>
      {typography && onChangeTypography ? (
        <TypographyControls value={typography} onChange={onChangeTypography} />
      ) : null}
      <DisplayChoice
        legend={translate({ message: "Theme" })}
        value={theme}
        options={themePreferences.map((value) => ({ value, label: capitalize(value) }))}
        onChange={onChangeTheme}
      />
      {onOpenSettings ? (
        <>
          <hr />
          <button type="button" onClick={onOpenSettings}>
            <Trans>Settings…</Trans>
          </button>
        </>
      ) : null}
    </>
  );
}

/**
 * This device's other choices, in the Settings page's "This device" section: language, density
 * and how annotating behaves. None of them is in the display menu.
 */
export function DeviceSettings({
  density,
  onChangeDensity,
}: {
  readonly density: "comfortable" | "compact";
  readonly onChangeDensity: (density: "comfortable" | "compact") => void;
}): JSX.Element {
  useLocale();
  const highlightOnSelect = useHighlightOnSelect();
  const annotationOwner = useAnnotationOwnerPreference();
  return (
    <>
      <ReaderLanguageSetting />
      <DisplayChoice
        legend={translate({ message: "Density" })}
        value={density}
        options={[
          { value: "comfortable", label: translate({ message: "Comfortable" }) },
          { value: "compact", label: translate({ message: "Compact" }) },
        ]}
        onChange={onChangeDensity}
      />
      <DisplayChoice
        legend={translate({ message: "Annotations made inside a chapter belong to" })}
        value={annotationOwner}
        options={[
          { value: "chapter", label: translate({ message: "Chapter" }) },
          { value: "book", label: translate({ message: "Book" }) },
        ]}
        onChange={setAnnotationOwnerPreference}
      />
      <DisplayChoice
        legend={translate({ message: "Selecting text" })}
        value={highlightOnSelect}
        options={[
          { value: "offer", label: translate({ message: "Show actions" }) },
          { value: "instant", label: translate({ message: "Highlight at once" }) },
        ]}
        onChange={setHighlightOnSelect}
      />
    </>
  );
}

export function DisplayChoice<T extends string>({
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
  useLocale();
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
            aria-label={translate({ message: "Smaller text" })}
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
            aria-label={translate({ message: "Larger text" })}
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
        legend={translate({ message: "Line length" })}
        value={value.measure}
        options={[
          { value: "narrow", label: translate({ message: "Narrow" }) },
          { value: "standard", label: translate({ message: "Standard" }) },
          { value: "wide", label: translate({ message: "Wide" }) },
        ]}
        onChange={(measure) => onChange({ ...value, measure })}
      />
      <DisplayChoice
        legend={translate({ message: "Typeface" })}
        value={value.face}
        options={[
          { value: "serif", label: translate({ message: "Serif" }) },
          { value: "sans", label: translate({ message: "Sans" }) },
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

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}
