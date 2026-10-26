import { t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { highlightColorKeys } from "@mdbase-reader/core";
import { useId, useMemo, type JSX } from "react";

import {
  annotationMatchesColor,
  searchAnnotationIndex,
  type AnnotationColorFilter,
  type AnnotationFilter,
  type indexAnnotations,
} from "./annotation-list-order.js";
import { highlightColorName, useHighlightChoices } from "./highlight-colors.js";
import { FilterIcon } from "./icons.js";
import { Menu } from "./Menu.js";

import type { SourceSummary } from "@mdbase-reader/core";

export type AnnotationOrder = "document" | "newest";

/** What the Notes panel lists: kind of annotation, order, and (for a book) which source. */
export interface AnnotationView {
  readonly filter: AnnotationFilter;
  readonly order: AnnotationOrder;
  /** A source id, or "" for every source in the panel. */
  readonly source: string;
  /** A highlight colour, or "" for every colour. */
  readonly color: AnnotationColorFilter;
}

export const defaultAnnotationView: AnnotationView = {
  filter: "all",
  order: "document",
  source: "",
  color: "",
};

export function annotationViewIsDefault(view: AnnotationView): boolean {
  return (
    view.filter === defaultAnnotationView.filter &&
    view.order === defaultAnnotationView.order &&
    view.source === defaultAnnotationView.source &&
    view.color === defaultAnnotationView.color
  );
}

const filterChoices: readonly { readonly value: AnnotationFilter; readonly label: string }[] = [
  {
    value: "all",
    get label() {
      return translate({ message: "All annotations" });
    },
  },
  {
    value: "highlight",
    get label() {
      return translate({ message: "Highlights" });
    },
  },
  {
    value: "comments",
    get label() {
      return translate({ message: "With comments" });
    },
  },
  {
    value: "area",
    get label() {
      return translate({ message: "Area captures" });
    },
  },
  {
    value: "note",
    get label() {
      return translate({ message: "Source comments" });
    },
  },
  {
    value: "bookmark",
    get label() {
      return translate({ message: "Bookmarks" });
    },
  },
];

const orderChoices: readonly { readonly value: AnnotationOrder; readonly label: string }[] = [
  {
    value: "document",
    get label() {
      return translate({ message: "Document order" });
    },
  },
  {
    value: "newest",
    get label() {
      return translate({ message: "Newest first" });
    },
  },
];

/**
 * One menu for everything that changes what the list shows: type, source, order, following the
 * reading position, and page search. A dot on the trigger says something is not at its default.
 */
export function AnnotationFilterMenu({
  view,
  onViewChange,
  scoped,
  owners,
  wholeBook,
  following,
  onFollowingChange,
  renderAll,
  onRenderAllChange,
  changed,
}: {
  readonly view: AnnotationView;
  readonly onViewChange: (view: AnnotationView) => void;
  /** The searchable annotations within the chosen source, for per-type counts. */
  readonly scoped: ReturnType<typeof indexAnnotations>;
  readonly owners?: readonly SourceSummary[] | undefined;
  readonly wholeBook?:
    { readonly value: boolean; readonly onChange: (value: boolean) => void } | undefined;
  readonly following: boolean;
  readonly onFollowingChange: (following: boolean) => void;
  readonly renderAll: boolean;
  readonly onRenderAllChange: (renderAll: boolean) => void;
  readonly changed: boolean;
}): JSX.Element {
  useLocale();
  const counts = useMemo(
    () =>
      new Map(
        filterChoices.map(({ value }) => [value, searchAnnotationIndex(scoped, "", value).length]),
      ),
    [scoped],
  );
  return (
    <Menu
      className="annotation-filter-menu"
      label={
        changed
          ? translate({ message: "Filter annotations (changed)" })
          : translate({ message: "Filter annotations" })
      }
      title={translate({ message: "Filter annotations" })}
      triggerClassName={`icon-button annotation-filter-trigger${changed ? " is-changed" : ""}`}
      trigger={<FilterIcon />}
    >
      {/* Choices apply at once and leave the menu open, so several can be changed together. */}
      <div className="annotation-filter-panel" data-menu-keep-open>
        <RadioChoices
          label={translate({ message: "Show" })}
          choices={filterChoices.map((choice) => ({
            ...choice,
            count: counts.get(choice.value) ?? 0,
          }))}
          value={view.filter}
          onChange={(filter) => onViewChange({ ...view, filter })}
        />
        <ColorChoices view={view} onViewChange={onViewChange} scoped={scoped} />
        {owners && owners.length > 1 ? (
          <label className="annotation-filter-source">
            <span className="menu-label">
              <Trans>Source</Trans>
            </span>
            <select
              aria-label={translate({ message: "Filter annotations by source" })}
              value={view.source}
              onChange={(event) => onViewChange({ ...view, source: event.target.value })}
            >
              <option value="">
                <Trans>All sources</Trans>
              </option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <hr />
        <RadioChoices
          label={translate({ message: "Order" })}
          choices={orderChoices}
          value={view.order}
          onChange={(order) => onViewChange({ ...view, order })}
        />
        <hr />
        {wholeBook ? (
          <SwitchItem
            label={translate({ message: "Show the whole book’s annotations" })}
            checked={wholeBook.value}
            onChange={wholeBook.onChange}
          />
        ) : null}
        <SwitchItem
          label={translate({ message: "Follow reading position" })}
          checked={following}
          onChange={onFollowingChange}
        />
        <SwitchItem
          label={translate({ message: "Include all annotations in page search" })}
          hint={
            renderAll
              ? translate({ message: "Slower with long lists" })
              : translate({ message: "Search above covers all annotations" })
          }
          checked={renderAll}
          onChange={onRenderAllChange}
        />
      </div>
    </Menu>
  );
}

/**
 * The Colour choices, named by what each colour means in this collection. Counts follow the
 * chosen type, so each colour shows what choosing it gives. Colours the collection offers come
 * first, in its order; a hidden colour follows only while highlights have it. Hidden while
 * nothing has a colour.
 */
function ColorChoices({
  view,
  onViewChange,
  scoped,
}: {
  readonly view: AnnotationView;
  readonly onViewChange: (view: AnnotationView) => void;
  readonly scoped: ReturnType<typeof indexAnnotations>;
}): JSX.Element | null {
  useLocale();
  const { colors, meanings } = useHighlightChoices();
  const counts = useMemo(() => {
    const shown = searchAnnotationIndex(scoped, "", view.filter);
    return new Map(
      highlightColorKeys.map((color) => [
        color,
        shown.filter((annotation) => annotationMatchesColor(annotation, color)).length,
      ]),
    );
  }, [scoped, view.filter]);
  const any = [...counts.values()].reduce((total, count) => total + count, 0);
  if (!any && !view.color) {
    return null;
  }
  const listed = [
    ...colors,
    ...highlightColorKeys.filter(
      (color) => !colors.includes(color) && ((counts.get(color) ?? 0) > 0 || view.color === color),
    ),
  ];
  return (
    <>
      <hr />
      <RadioChoices<AnnotationColorFilter>
        label={translate({ message: "Colour" })}
        choices={[
          { value: "", label: translate({ message: "Any colour" }) },
          ...listed.map((color) => ({
            value: color,
            label: highlightColorName(color, meanings),
            count: counts.get(color) ?? 0,
          })),
        ]}
        value={view.color}
        onChange={(color) => onViewChange({ ...view, color })}
      />
    </>
  );
}

const radioKeys: Readonly<Record<string, number>> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
};

/** A radio group: one tab stop on the chosen item, arrow keys move and choose. */
function RadioChoices<T extends string>({
  label,
  choices,
  value,
  onChange,
}: {
  readonly label: string;
  readonly choices: readonly {
    readonly value: T;
    readonly label: string;
    readonly count?: number;
  }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}): JSX.Element {
  const id = useId();
  return (
    <div role="radiogroup" aria-labelledby={id}>
      <span className="menu-label" id={id}>
        {label}
      </span>
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          role="radio"
          className="annotation-filter-choice"
          aria-checked={value === choice.value}
          tabIndex={value === choice.value ? 0 : -1}
          data-value={choice.value}
          onClick={() => onChange(choice.value)}
          onKeyDown={(event) => {
            const step = radioKeys[event.key];
            const index = choices.findIndex((item) => item.value === value);
            const next =
              step === undefined
                ? undefined
                : choices[(index + step + choices.length) % choices.length];
            if (next) {
              event.preventDefault();
              onChange(next.value);
              event.currentTarget.parentElement
                ?.querySelector<HTMLElement>(`[data-value="${CSS.escape(next.value)}"]`)
                ?.focus();
            }
          }}
        >
          {choice.label}
          {choice.count === undefined ? null : (
            <span className="annotation-filter-count">{choice.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function SwitchItem({
  label,
  hint,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly hint?: string | undefined;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}): JSX.Element {
  const id = useId();
  // The name is the label alone; the hint is its description, read once.
  return (
    <button
      type="button"
      role="switch"
      className="annotation-filter-switch"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      aria-describedby={hint ? `${id}-hint` : undefined}
      onClick={() => onChange(!checked)}
    >
      <span className="annotation-filter-switch-label">
        <span id={`${id}-label`}>{label}</span>
        {hint ? <small id={`${id}-hint`}>{hint}</small> : null}
      </span>
      <span className="annotation-filter-switch-track" aria-hidden="true" />
    </button>
  );
}
