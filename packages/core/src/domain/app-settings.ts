/**
 * App settings records (`docs/design/app-settings.md`): one record per app at
 * `_settings/<app>.md` whose flat frontmatter holds collection-wide policy. This module is the
 * pure part: where the record lives, how a record resolves to values (schema defaults for
 * anything missing or invalid), and which fields a save changes.
 */

/** The folder collection-scope settings records live in. Visible: dot-paths are not records. */
export const appSettingsFolder = "_settings";

/** One app setting: its default, and why a stored value is unusable (undefined when it is). */
export interface AppSettingField<Value> {
  readonly default: Value;
  readonly problem: (value: unknown) => string | undefined;
}

export interface AppSettingsDefinition<Values extends object> {
  /** The app id, `^[a-z0-9]+([.-][a-z0-9]+)*$`. */
  readonly app: string;
  /** The app's settings type, written as the record's `type`. */
  readonly type: string;
  /** The newest settings version this client understands, and the one it writes. */
  readonly settingsVersion: number;
  readonly fields: { readonly [Key in keyof Values]: AppSettingField<Values[Key]> };
}

export interface AppSettingsWarning {
  /** The setting the warning is about; absent for the record as a whole. */
  readonly field?: string;
  readonly message: string;
}

export interface ResolvedAppSettings<Values extends object> {
  /** Every setting: the record's value when it is usable, else the default. */
  readonly values: Values;
  /** The settings the record holds a usable value for. */
  readonly stored: Partial<Values>;
  /** Fields the record holds but cannot be used. Non-blocking: defaults apply meanwhile. */
  readonly warnings: readonly AppSettingsWarning[];
  /** Why these settings cannot be saved from this client, when they cannot. */
  readonly readOnly?: string;
}

/** A save: a new value per changed setting, or null to go back to the default. */
export type AppSettingsChanges<Values extends object> = {
  readonly [Key in keyof Values]?: Values[Key] | null;
};

export function appSettingsPath(app: string): string {
  return `${appSettingsFolder}/${app}.md`;
}

/** The defaults: what a collection with no settings record uses. */
export function defaultAppSettings<Values extends object>(
  definition: AppSettingsDefinition<Values>,
): ResolvedAppSettings<Values> {
  return resolveAppSettings(definition, undefined);
}

/**
 * The settings a record's frontmatter gives, or the defaults when there is no record. Each
 * missing or unusable field takes its default; usable ones are kept as written. A record whose
 * `settings_version` is newer than this client understands is used as written but read-only, as
 * is one that is not this app's collection-scope record.
 */
export function resolveAppSettings<Values extends object>(
  definition: AppSettingsDefinition<Values>,
  frontmatter: Readonly<Record<string, unknown>> | undefined,
): ResolvedAppSettings<Values> {
  const values: Record<string, unknown> = {};
  const stored: Record<string, unknown> = {};
  const warnings: AppSettingsWarning[] = [];
  for (const [key, field] of fieldEntries(definition)) {
    values[key] = field.default;
    if (frontmatter === undefined || !Object.hasOwn(frontmatter, key)) {
      continue;
    }
    const value = frontmatter[key];
    const problem = field.problem(value);
    if (problem) {
      warnings.push({ field: key, message: problem });
    } else {
      values[key] = value;
      stored[key] = value;
    }
  }
  const readOnly = frontmatter ? readOnlyReason(definition, frontmatter) : undefined;
  return {
    values: values as Values,
    stored: stored as Partial<Values>,
    warnings,
    ...(readOnly ? { readOnly } : {}),
  };
}

/**
 * The frontmatter patch for a save: only the settings whose stored value changes, with null for a
 * setting going back to its default (the field is removed). Other fields, including ones from
 * newer clients, are left alone. `settings_version` is raised to this client's when it writes.
 */
export function appSettingsPatch<Values extends object>(
  definition: AppSettingsDefinition<Values>,
  frontmatter: Readonly<Record<string, unknown>>,
  changes: AppSettingsChanges<Values>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || !Object.hasOwn(definition.fields, key)) {
      continue;
    }
    const present = Object.hasOwn(frontmatter, key);
    if (value === null ? present : !present || !sameValue(frontmatter[key], value)) {
      patch[key] = value;
    }
  }
  if (
    Object.keys(patch).length > 0 &&
    frontmatter["settings_version"] !== definition.settingsVersion
  ) {
    patch["settings_version"] = definition.settingsVersion;
  }
  return patch;
}

/** The frontmatter of a new settings record holding `changes`. */
export function newAppSettingsFrontmatter<Values extends object>(
  definition: AppSettingsDefinition<Values>,
  changes: AppSettingsChanges<Values>,
): Record<string, unknown> {
  const values = Object.fromEntries(
    Object.entries(changes as Record<string, unknown>).filter(
      ([key, value]) =>
        value !== undefined && value !== null && Object.hasOwn(definition.fields, key),
    ),
  );
  return {
    type: definition.type,
    app: definition.app,
    scope: "collection",
    settings_version: definition.settingsVersion,
    ...values,
  };
}

/**
 * The settings `changes` would change that also changed between `base` and `current`: a save
 * prepared against `base` would overwrite someone else's edit of them.
 */
export function conflictingAppSettings<Values extends object>(
  definition: AppSettingsDefinition<Values>,
  base: Readonly<Record<string, unknown>> | undefined,
  current: Readonly<Record<string, unknown>>,
  changes: AppSettingsChanges<Values>,
): readonly string[] {
  return Object.keys(changes).filter(
    (key) =>
      Object.hasOwn(definition.fields, key) &&
      (changes as Record<string, unknown>)[key] !== undefined &&
      !sameValue(base?.[key], current[key]),
  );
}

function readOnlyReason<Values extends object>(
  definition: AppSettingsDefinition<Values>,
  frontmatter: Readonly<Record<string, unknown>>,
): string | undefined {
  const path = appSettingsPath(definition.app);
  if (frontmatter["app"] !== undefined && frontmatter["app"] !== definition.app) {
    return `${path} names another app, so it is left as it is.`;
  }
  if (frontmatter["scope"] !== undefined && frontmatter["scope"] !== "collection") {
    return `${path} is not a collection-wide settings record, so it is left as it is.`;
  }
  const version = frontmatter["settings_version"];
  if (typeof version === "number" && version > definition.settingsVersion) {
    return "A newer version of this app saved these settings. Update it to change them here.";
  }
  return undefined;
}

function fieldEntries<Values extends object>(
  definition: AppSettingsDefinition<Values>,
): [string, AppSettingField<unknown>][] {
  return Object.entries(definition.fields);
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
