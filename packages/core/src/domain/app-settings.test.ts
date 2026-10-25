import { describe, expect, it } from "vitest";

import {
  appSettingsPatch,
  appSettingsPath,
  conflictingAppSettings,
  defaultAppSettings,
  newAppSettingsFrontmatter,
  resolveAppSettings,
  type AppSettingsDefinition,
} from "./app-settings.js";

interface Example {
  readonly greeting: string;
  readonly limit: number;
}

const definition: AppSettingsDefinition<Example> = {
  app: "example.app",
  type: "example-settings",
  settingsVersion: 2,
  fields: {
    greeting: {
      default: "hello",
      problem: (value) => (typeof value === "string" && value ? undefined : "Needs some text."),
    },
    limit: {
      default: 10,
      problem: (value) => (Number.isInteger(value) ? undefined : "Needs a whole number."),
    },
  },
};

const record = {
  type: "example-settings",
  app: "example.app",
  scope: "collection",
  settings_version: 2,
  greeting: "hi",
  from_newer_client: true,
};

describe("resolveAppSettings", () => {
  it("lives at _settings/<app>.md", () => {
    expect(appSettingsPath("dev.mdbase.reader")).toBe("_settings/dev.mdbase.reader.md");
  });

  it("uses every default without a record", () => {
    expect(defaultAppSettings(definition)).toEqual({
      values: { greeting: "hello", limit: 10 },
      stored: {},
      warnings: [],
    });
  });

  it("keeps valid fields as written and defaults the missing ones", () => {
    const resolved = resolveAppSettings(definition, record);
    expect(resolved.values).toEqual({ greeting: "hi", limit: 10 });
    expect(resolved.stored).toEqual({ greeting: "hi" });
    expect(resolved.readOnly).toBeUndefined();
  });

  it("defaults an invalid field with a warning, keeping the valid ones", () => {
    const resolved = resolveAppSettings(definition, { ...record, limit: "lots" });
    expect(resolved.values).toEqual({ greeting: "hi", limit: 10 });
    expect(resolved.warnings).toEqual([{ field: "limit", message: "Needs a whole number." }]);
    expect(resolved.readOnly).toBeUndefined();
  });

  it("uses a newer client's settings as written but read-only", () => {
    const resolved = resolveAppSettings(definition, { ...record, settings_version: 3 });
    expect(resolved.values.greeting).toBe("hi");
    expect(resolved.readOnly).toMatch(/newer version/u);
  });

  it("leaves alone a record for another app or scope", () => {
    expect(resolveAppSettings(definition, { ...record, app: "other" }).readOnly).toMatch(
      /another app/u,
    );
    expect(resolveAppSettings(definition, { ...record, scope: "user" }).readOnly).toMatch(
      /not a collection-wide/u,
    );
  });
});

describe("appSettingsPatch", () => {
  it("patches only the settings that change", () => {
    expect(appSettingsPatch(definition, record, { greeting: "hi", limit: 5 })).toEqual({
      limit: 5,
    });
    expect(appSettingsPatch(definition, record, { greeting: "hi" })).toEqual({});
  });

  it("removes a setting going back to its default, and only if it is there", () => {
    expect(appSettingsPatch(definition, record, { greeting: null })).toEqual({ greeting: null });
    expect(appSettingsPatch(definition, record, { limit: null })).toEqual({});
  });

  it("raises an older record's settings version when it writes", () => {
    expect(appSettingsPatch(definition, { ...record, settings_version: 1 }, { limit: 1 })).toEqual({
      limit: 1,
      settings_version: 2,
    });
  });

  it("ignores fields it does not define", () => {
    expect(
      appSettingsPatch(definition, record, { from_newer_client: false } as Partial<Example>),
    ).toEqual({});
  });
});

describe("new records and conflicts", () => {
  it("creates a record with the reserved fields and the changed settings only", () => {
    expect(newAppSettingsFrontmatter(definition, { greeting: "hey", limit: null })).toEqual({
      app: "example.app",
      scope: "collection",
      settings_version: 2,
      greeting: "hey",
    });
  });

  it("finds the settings someone else changed since the save was prepared", () => {
    const current = { ...record, greeting: "yo", limit: 3 };
    expect(conflictingAppSettings(definition, record, current, { greeting: "hey" })).toEqual([
      "greeting",
    ]);
    expect(conflictingAppSettings(definition, record, current, { limit: 4 })).toEqual(["limit"]);
    expect(conflictingAppSettings(definition, record, record, { greeting: "hey" })).toEqual([]);
  });
});
