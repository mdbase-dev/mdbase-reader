---
kind: mdbase.type
name: reader-annotation
version: 1
description: An independently addressable mdbase Reader annotation.
schema:
  dialect: json-schema-2020-12
  value:
    $schema: https://json-schema.org/draft/2020-12/schema
    type: object
    additionalProperties: true
    required: [type, id, source, annotation_type, created_at]
    properties:
      type: { const: reader-annotation }
      id: { type: string, minLength: 1 }
      source: { type: string, minLength: 1 }
      document:
        type: object
        additionalProperties: false
        required: [file_id, file, revision]
        properties:
          file_id: { type: string, minLength: 1 }
          file: { type: string, minLength: 1 }
          revision: { type: string, pattern: "^sha256:[0-9a-f]{64}$" }
      annotation_type: { type: string, minLength: 1 }
      motivation: { type: string }
      color: { type: string }
      locator:
        type: object
        additionalProperties: true
      target:
        type: object
        additionalProperties: true
      tags:
        type: array
        items: { type: string }
      created_at: { type: string, format: date-time }
      modified_at: { type: string, format: date-time }
      created_by: { type: string }
match:
  path_glob: annotations/**/*.md
  fields_present: [id, source, annotation_type]
collection:
  unique:
    - field: id
      scope: type
  links:
    source:
      target_type: reader-source
      validate_exists: true
    document.file:
      target_type: any
      validate_exists: true
implements:
  - contract: dev.mdbase.reader.annotation
    version: 1.0.0-beta.1
    fields:
      id: id
      source: source
      document: document
      annotation_type: annotation_type
      motivation: motivation
      color: color
      locator: locator
      target: target
      tags: tags
      created_at: created_at
      modified_at: modified_at
      created_by: created_by
---

# Reader annotation

The body contains a readable quotation, an optional note, or both.
