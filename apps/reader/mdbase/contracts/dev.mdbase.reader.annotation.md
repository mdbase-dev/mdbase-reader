---
kind: mdbase.contract
contract_type: record
id: dev.mdbase.reader.annotation
version: 1.0.0-beta.1
name: mdbase Reader annotation
description: An independently addressable annotation attached to a Reader source.
record_schema:
  dialect: json-schema-2020-12
  value:
    $schema: https://json-schema.org/draft/2020-12/schema
    type: object
    additionalProperties: false
    required: [id, source, annotation_type, created_at]
    properties:
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
---

# mdbase Reader annotation

The portable Reader view of an annotation. Its Markdown body contains the
readable quotation and the user's note.
