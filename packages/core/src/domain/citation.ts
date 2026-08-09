import { citekeyPattern, cslTypes } from "./citation-schema.js";
import { isJsonValue, isObject, validateCslField } from "./citation-validation.js";

export type CslItem = Readonly<Record<string, unknown>> & {
  readonly id: string;
  readonly type: string;
};

export interface CslValidationProblem {
  readonly path: string;
  readonly message: string;
}

export type CslValidation =
  | { readonly valid: true; readonly item: CslItem }
  | { readonly valid: false; readonly problems: readonly CslValidationProblem[] };

/**
 * Validates one Reader CSL item against the CSL 1.0 JSON input shape.
 *
 * Reader narrows the official numeric-or-string `id` to a Pandoc-compatible
 * string citekey. Non-CSL extension values belong under CSL's `custom` field.
 * Field sets mirror the official CSL data schema:
 * https://resource.citationstyles.org/schema/v1.0/input/json/csl-data.json
 */
export function validateCslItem(value: unknown): CslValidation {
  const problems: CslValidationProblem[] = [];
  if (!isObject(value)) {
    return { valid: false, problems: [{ path: "csl", message: "must be one CSL object" }] };
  }
  if (!isJsonValue(value)) {
    problems.push({ path: "csl", message: "must contain only JSON-compatible values" });
  }
  validateIdentity(value, problems);
  for (const [field, candidate] of Object.entries(value)) {
    if (field !== "id" && field !== "type") {
      validateCslField(field, candidate, problems);
    }
  }
  return problems.length === 0
    ? { valid: true, item: value as CslItem }
    : { valid: false, problems };
}

export function cslProblemSummary(problems: readonly CslValidationProblem[]): string {
  return problems.map(({ path, message }) => `${path} ${message}`).join("; ");
}

function validateIdentity(
  value: Readonly<Record<string, unknown>>,
  problems: CslValidationProblem[],
): void {
  const id = value["id"];
  if (typeof id !== "string" || !citekeyPattern.test(id)) {
    problems.push({
      path: "csl.id",
      message: "must be a non-empty Pandoc-compatible citekey",
    });
  }
  const type = value["type"];
  if (typeof type !== "string" || !cslTypes.has(type)) {
    problems.push({ path: "csl.type", message: "must be a recognized CSL item type" });
  }
}
