/**
 * Reader's collection-wide settings: the `reader-settings` record at
 * `_settings/dev.mdbase.reader.md` (`docs/design/app-settings.md`). Today it holds the two name
 * templates; the definition mirrors the managed schema
 * `dev.mdbase.reader.settings/1.0.0.schema.json` in Reader's type pack.
 */
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
  ResolvedAppSettings,
} from "@mdbase-reader/core";

export interface ReaderSettingsValues {
  readonly source_name_template: string;
  readonly annotation_name_template: string;
}

export type ReaderSettingKey = keyof ReaderSettingsValues;

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

export const readerSettingsDefinition: AppSettingsDefinition<ReaderSettingsValues> = {
  app: "dev.mdbase.reader",
  type: "reader-settings",
  settingsVersion: 1,
  fields: {
    source_name_template: templateField(defaultSourceNameTemplate),
    annotation_name_template: templateField(defaultAnnotationNameTemplate),
  },
};

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
}
