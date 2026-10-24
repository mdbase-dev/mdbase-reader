import type { ConnectProblem } from "@mdbase-dev/connect";
import type { Issue } from "@mdbase-dev/sdk";

/** The native SDK's submitted-record diagnostics, retained across the legacy facade. */
export type ConnectValidationIssue = Readonly<Issue>;
export type ReaderConnectProblem = ConnectProblem & {
  readonly issues?: readonly ConnectValidationIssue[];
};

const fieldLabels: Readonly<Record<string, string>> = {
  title: "Title",
  authors: "Authors",
  published: "Published",
  url: "URL",
  description: "Description",
  language: "Language",
  saved_at: "Saved date",
  created_at: "Created date",
  annotation_type: "Annotation type",
  source: "Source",
  tags: "Tags",
  "csl.DOI": "DOI",
  "csl.ISBN": "ISBN",
  "csl.ISSN": "ISSN",
  "reading.status": "Reading status",
};

const explanations: Readonly<Record<string, string>> = {
  schema_required: "is required",
  schema_type: "has the wrong type",
  schema_enum: "must use an allowed value",
  schema_const: "must use the required value",
  schema_min_length: "is too short",
  schema_max_length: "is too long",
  schema_minimum: "is below the allowed minimum",
  schema_maximum: "is above the allowed maximum",
  schema_pattern: "does not match the required format",
  format_invalid: "does not match the required format",
  link_not_found: "must refer to an existing record",
};

function ownValue(values: Readonly<Record<string, string>>, key: string): string | undefined {
  return Object.hasOwn(values, key) ? values[key] : undefined;
}

function schemaField(details: ConnectValidationIssue["details"]): string | undefined {
  // The server sends only the failing schema keyword's location, e.g.
  // `/properties/csl/properties/DOI/pattern`; its property names are schema-defined.
  const location =
    details instanceof Map
      ? [...details].find(([key]) => key === "schema_location")?.[1]
      : undefined;
  if (typeof location !== "string") {
    return undefined;
  }
  const names = [...location.matchAll(/\/properties\/([^/]+)/g)].map((match) => match[1]);
  return names.length > 0 ? names.join(".") : undefined;
}

function issueField(issue: ConnectValidationIssue): string | undefined {
  // Problem.issues uses SDK Issue, not RecordValidation's richer ValidationIssue.
  // A missing required property is named only in the diagnostic's message.
  const required =
    issue.code === "schema_required"
      ? /^(?:required property `([^`]+)` is missing|["'`]([^"'`]+)["'`] is a required property|["'`]?([\w.[\]-]+)["'`]? is required)\.?$/.exec(
          issue.message,
        )
      : null;
  const parent = schemaField(issue.details);
  const leaf = required?.[1] ?? required?.[2] ?? required?.[3];
  const field = leaf && parent ? `${parent}.${leaf}` : (leaf ?? parent);
  if (typeof field !== "string") {
    return undefined;
  }
  return /^[a-zA-Z_][\w.[\]-]{0,79}$/.test(field) ? field : undefined;
}

/** Never render arbitrary diagnostic messages/details: schema errors can quote
 * record values, URLs with credentials, or whole source fragments. Use only
 * field keys and fixed explanations; keep the typed diagnostics for callers. */
export function validationIssueSummary(issues: readonly ConnectValidationIssue[]): string {
  const messages = [
    ...new Set(
      issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => {
          const field = issueField(issue);
          const label = field ? (ownValue(fieldLabels, field) ?? field) : "A field";
          const explanation =
            ownValue(explanations, issue.code) ?? "does not meet its validation rules";
          return `${label} ${explanation}`;
        }),
    ),
  ];
  const shown = messages.slice(0, 3).join("; ");
  return messages.length > 3 ? `${shown}; and ${String(messages.length - 3)} more issues` : shown;
}
