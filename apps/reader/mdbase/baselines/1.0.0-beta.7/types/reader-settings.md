---
kind: mdbase.type
name: reader-settings
version: 2
description: mdbase Reader's collection-wide settings, one record at _settings/dev.mdbase.reader.md.
schema:
  dialect: json-schema-2020-12
  ref: ../schemas/dev.mdbase.reader.settings/1.1.0.schema.json
collection:
  unique:
    - field: app
      scope: type
implements:
  - contract: mdbase.app-settings
    version: 1.0.0
    fields:
      app: app
      scope: scope
      settings_version: settings_version
  - contract: dev.mdbase.reader.settings
    version: 1.1.0
    fields:
      app: app
      scope: scope
      settings_version: settings_version
      source_name_template: source_name_template
      annotation_name_template: annotation_name_template
      highlight_colors: highlight_colors
      highlight_meanings: highlight_meanings
---

# Reader settings

Settings that every mdbase Reader client honours in this collection. The schema
is the managed `dev.mdbase.reader.settings` schema from Reader's type pack, so this
type carries no copy of it.
