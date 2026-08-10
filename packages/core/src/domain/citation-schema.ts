import cslDataSchema from "./csl-data.schema.json" with { type: "json" };

export type CslFieldKind = "date" | "name" | "number" | "object" | "string" | "string-list";

export interface CslFieldDefinition {
  readonly name: string;
  readonly kind: CslFieldKind;
}

// Vendored from citation-style-language/schema@e3ce254a72c4470a5ed3b9d23b428017d25674e9.
// Types and variables are derived from it so the validator and editor share one authority.
const properties = cslDataSchema.items.properties as Readonly<
  Record<string, Readonly<Record<string, unknown>>>
>;

export const cslTypes = new Set(cslDataSchema.items.properties.type.enum);

export const cslFieldDefinitions: readonly CslFieldDefinition[] = Object.entries(properties)
  .filter(([name]) => name !== "id" && name !== "type")
  .map(([name, schema]) => ({ name, kind: fieldKind(schema) }))
  .sort((left, right) => left.name.localeCompare(right.name));

export const cslFieldKinds: ReadonlyMap<string, CslFieldKind> = new Map(
  cslFieldDefinitions.map(({ name, kind }) => [name, kind]),
);

export const nameFields = fieldsOfKind("name");
export const dateFields = fieldsOfKind("date");
export const numberFields = fieldsOfKind("number");
export const stringFields = fieldsOfKind("string");

const nameProperties = (cslDataSchema.definitions["name-variable"].anyOf[0]?.properties ??
  {}) as Readonly<Record<string, { readonly type: unknown }>>;
export const nameStringFields = new Set(
  Object.entries(nameProperties)
    .filter(([, schema]) => schema.type === "string")
    .map(([name]) => name),
);
export const nameFlagFields = new Set(
  Object.entries(nameProperties)
    .filter(([, schema]) => Array.isArray(schema.type))
    .map(([name]) => name),
);

export const citekeyPattern = /^[\p{L}\p{N}_][\p{L}\p{N}_:.#$%&+?<>~/-]*$/u;

function fieldsOfKind(kind: CslFieldKind): ReadonlySet<string> {
  return new Set(
    cslFieldDefinitions.filter((field) => field.kind === kind).map((field) => field.name),
  );
}

function fieldKind(schema: Readonly<Record<string, unknown>>): CslFieldKind {
  const reference = schema["$ref"];
  if (typeof reference === "string" && reference.endsWith("date-variable")) {
    return "date";
  }
  const items = record(schema["items"]);
  if (schema["type"] === "array" && typeof items?.["$ref"] === "string") {
    return "name";
  }
  if (schema["type"] === "array") {
    return "string-list";
  }
  if (schema["type"] === "object") {
    return "object";
  }
  return Array.isArray(schema["type"]) ? "number" : "string";
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}
