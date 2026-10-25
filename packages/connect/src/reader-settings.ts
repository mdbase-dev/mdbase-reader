/**
 * Reader's collection-wide settings: the `reader-settings` record at
 * `_settings/dev.mdbase.reader.md` (`docs/design/app-settings.md`): the two name templates, and
 * which highlight colours Reader offers and what each means. The definition mirrors the managed
 * schema `dev.mdbase.reader.settings/1.1.0.schema.json` in Reader's type pack.
 */
import {
  highlightColorKeys,
  readHighlightColorList,
  readHighlightMeanings,
} from "@mdbase-reader/core";

import { AppSettingsStore, type AppSettingsStoreOptions } from "./app-settings-store.js";
import { maxNameTemplateLength, nameTemplateProblem } from "./name-template-engine.js";
import {
  defaultAnnotationNameTemplate,
  defaultSourceNameTemplate,
  type ReaderNameTemplates,
  type ReaderNaming,
} from "./naming-templates.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type {
  AppSettingField,
  AppSettingsDefinition,
  HighlightColorKey,
  HighlightMeanings,
  ResolvedAppSettings,
} from "@mdbase-reader/core";

export interface ReaderSettingsValues {
  readonly source_name_template: string;
  readonly annotation_name_template: string;
  /** The colours offered for new and recoloured highlights, in order. */
  readonly highlight_colors: readonly HighlightColorKey[];
  /** What each colour means; a colour without one is called by its name. */
  readonly highlight_meanings: HighlightMeanings;
}

export type ReaderSettingKey = keyof ReaderSettingsValues;
export type ReaderNameTemplateKey = "source_name_template" | "annotation_name_template";

/** The collection's highlight colour settings, as plain data for any context. */
export interface ReaderHighlightSettings {
  readonly colors: readonly HighlightColorKey[];
  readonly meanings: HighlightMeanings;
  /** Whether the record holds meanings; until it does, a device may suggest its own. */
  readonly meaningsStored: boolean;
}

function templateField(fallback: string): AppSettingField<string> {
  return {
    default: fallback,
    // The schema's checks. Whether the template parses is checked by `refineReaderSettings`.
    problem: (value) => {
      if (typeof value !== "string") {
        return "This template is not text, so Reader's default is used.";
      }
      if (!value.trim()) {
        return "This template is empty, so Reader's default is used.";
      }
      return value.length > maxNameTemplateLength
        ? `This template is longer than ${String(maxNameTemplateLength)} characters, so Reader's default is used.`
        : undefined;
    },
  };
}

const highlightColorsField: AppSettingField<readonly HighlightColorKey[]> = {
  default: highlightColorKeys,
  problem: (value) => {
    if (!Array.isArray(value)) {
      return "The highlight colours are not a list, so all five are offered.";
    }
    return readHighlightColorList(value).length === 0
      ? "The highlight colours name no colour Reader knows, so all five are offered."
      : undefined;
  },
  read: readHighlightColorList,
};

const highlightMeaningsField: AppSettingField<HighlightMeanings> = {
  default: {},
  problem: (value) =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? undefined
      : "The highlight meanings are not a list of colours and names, so none are shown.",
  read: readHighlightMeanings,
};

export const readerSettingsDefinition: AppSettingsDefinition<ReaderSettingsValues> = {
  app: "dev.mdbase.reader",
  type: "reader-settings",
  settingsVersion: 1,
  fields: {
    source_name_template: templateField(defaultSourceNameTemplate),
    annotation_name_template: templateField(defaultAnnotationNameTemplate),
    highlight_colors: highlightColorsField,
    highlight_meanings: highlightMeaningsField,
  },
};

/** The highlight colour settings a snapshot's settings give. */
export function readerHighlightSettings(
  settings: ResolvedAppSettings<ReaderSettingsValues>,
): ReaderHighlightSettings {
  return {
    colors: settings.values.highlight_colors,
    meanings: settings.values.highlight_meanings,
    meaningsStored: Object.hasOwn(settings.stored, "highlight_meanings"),
  };
}

/** A stored template Knap cannot use takes its default, with a warning saying why. */
export async function refineReaderSettings(
  settings: ResolvedAppSettings<ReaderSettingsValues>,
): Promise<ResolvedAppSettings<ReaderSettingsValues>> {
  const values = { ...settings.values };
  const stored = new Map(Object.entries(settings.stored));
  const warnings = [...settings.warnings];
  for (const key of ["source_name_template", "annotation_name_template"] as const) {
    const template = settings.stored[key];
    const problem = template === undefined ? undefined : await nameTemplateProblem(template);
    if (problem) {
      values[key] = readerSettingsDefinition.fields[key].default;
      stored.delete(key);
      warnings.push({ field: key, message: `${problem}. Reader's default is used meanwhile.` });
    }
  }
  return {
    ...settings,
    values,
    stored: Object.fromEntries(stored),
    warnings,
  };
}

export class ReaderSettingsStore
  extends AppSettingsStore<ReaderSettingsValues>
  implements ReaderNaming
{
  public constructor(
    client: ReaderConnectClient,
    options: Omit<AppSettingsStoreOptions<ReaderSettingsValues>, "refine"> = {},
  ) {
    super(client, readerSettingsDefinition, { ...options, refine: refineReaderSettings });
  }

  public async templates(): Promise<ReaderNameTemplates> {
    const { values } = (await this.current()).settings;
    return { source: values.source_name_template, annotation: values.annotation_name_template };
  }

  /**
   * The highlight colour settings as now read, as plain data: what the extension's panel asks
   * for over its channel, where the store itself cannot go.
   */
  public async highlightColors(): Promise<ReaderHighlightSettings> {
    return readerHighlightSettings((await this.current()).settings);
  }
}
