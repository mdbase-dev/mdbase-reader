import { cslProblemSummary, validateCslItem, type Source } from "@mdbase-reader/core";

export type CitationDraftAssessment =
  | { readonly valid: true; readonly value: Readonly<Record<string, unknown>> }
  | {
      readonly valid: false;
      readonly message: string;
      readonly value?: Readonly<Record<string, unknown>>;
    };

export function citationDraftForSource(source: Source): string {
  const existing = source.frontmatter["csl"];
  const value =
    typeof existing === "object" && existing !== null && !Array.isArray(existing)
      ? existing
      : { id: "", type: "article", title: source.title };
  return JSON.stringify(value, null, 2);
}

export function assessCitationDraft(draft: string): CitationDraftAssessment {
  let value: unknown;
  try {
    value = JSON.parse(draft);
  } catch (reason) {
    const detail = reason instanceof SyntaxError ? reason.message : "The JSON could not be read.";
    return { valid: false, message: `Fix the JSON syntax: ${detail}` };
  }
  const validation = validateCslItem(value);
  const editableValue = objectValue(value);
  return validation.valid
    ? { valid: true, value: validation.item }
    : {
        valid: false,
        message: cslProblemSummary(validation.problems),
        ...(editableValue ? { value: editableValue } : {}),
      };
}

function objectValue(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}
