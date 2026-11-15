---
kind: mdbase.type
name: reader-settings
version: 3
description: mdbase Reader's collection-wide settings, one record at _mdbase/settings/dev.mdbase.reader.md (or _settings/dev.mdbase.reader.md in an older collection).
schema:
  dialect: json-schema-2020-12
  value:
    $schema: https://json-schema.org/draft/2020-12/schema
    title: dev.mdbase.reader.settings 1.2.0
    description: Collection-wide settings that every mdbase Reader client honours. Every field is optional and has a default, so a record with none of them behaves like no record at all.
    type: object
    required:
      - app
      - scope
      - settings_version
    properties:
      app:
        const: dev.mdbase.reader
        description: Marks this record as mdbase Reader's settings.
      scope:
        const: collection
        description: These settings apply to everyone using Reader in this collection.
      settings_version:
        type: integer
        minimum: 1
        description: The version of these settings that last wrote the record. Reader 1 writes 1.
      source_name_template:
        type: string
        minLength: 1
        maxLength: 500
        default: "{{ title | slug }}"
        description: A Knap template for the file name of a new source note, chapters included, without .md. A / starts a folder under sources/. Only new sources use it; existing files are never renamed.
      annotation_name_template:
        type: string
        minLength: 1
        maxLength: 500
        default: "{{ id }}"
        description: A Knap template for the file name of a new annotation under annotations/, without .md. Only new annotations use it; existing files are never renamed.
      highlight_colors:
        type: array
        items:
          enum:
            - yellow
            - green
            - blue
            - pink
            - purple
        minItems: 1
        uniqueItems: true
        default:
          - yellow
          - green
          - blue
          - pink
          - purple
        description: The highlight colours Reader offers for new highlights and for recolouring, in order. A colour left out still draws in its colour, shows in filters and can be recoloured; Reader only stops offering it.
      highlight_meanings:
        type: object
        properties:
          yellow:
            type: string
            minLength: 1
            maxLength: 40
          green:
            type: string
            minLength: 1
            maxLength: 40
          blue:
            type: string
            minLength: 1
            maxLength: 40
          pink:
            type: string
            minLength: 1
            maxLength: 40
          purple:
            type: string
            minLength: 1
            maxLength: 40
        additionalProperties: false
        default: {}
        description: What each highlight colour means in this collection, such as Question for pink. Highlights store only their colour, so changing a colour's meaning relabels every highlight already in that colour.
    additionalProperties: true
collection:
  unique:
    - field: app
      scope: type
implements:
  - contract: mdbase.app-settings
    version: 2.0.0
    fields:
      app: app
      scope: scope
      settings_version: settings_version
  - contract: dev.mdbase.reader.settings
    version: 1.2.0
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

Settings that every mdbase Reader client honours in this collection. The inline
schema matches `dev.mdbase.reader.settings` 1.2.0. Reader reads the new path
first, falls back to the legacy path, and saves back to the record it read.
