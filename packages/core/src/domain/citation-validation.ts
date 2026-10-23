import { t } from "@lingui/core/macro";

import { cslFieldKinds, nameFlagFields, nameStringFields } from "./citation-schema.js";

import type { CslValidationProblem } from "./citation.js";

export function validateCslField(
  field: string,
  candidate: unknown,
  problems: CslValidationProblem[],
): void {
  const path = `csl.${field}`;
  const kind = cslFieldKinds.get(field);
  if (kind === "string") {
    expectString(candidate, path, problems);
  } else if (kind === "number") {
    expectStringOrNumber(candidate, path, problems);
  } else if (kind === "name") {
    validateNames(candidate, path, problems);
  } else if (kind === "date") {
    validateDate(candidate, path, problems);
  } else if (kind === "string-list") {
    validateStringArray(candidate, path, problems);
  } else if (kind === "object") {
    if (!isObject(candidate)) {
      problems.push({
        path,
        message: t({ message: "must be an object", context: "CSL validation" }),
      });
    }
  } else {
    problems.push({
      path,
      message: t({
        message: "is not a CSL 1.0 field; preserve extension data under csl.custom",
        context: "CSL validation",
      }),
    });
  }
}

function validateNames(value: unknown, path: string, problems: CslValidationProblem[]): void {
  if (!Array.isArray(value)) {
    problems.push({
      path,
      message: t({ message: "must be an array of CSL names", context: "CSL validation" }),
    });
    return;
  }
  value.forEach((name, index) => validateName(name, `${path}[${String(index)}]`, problems));
}

function validateName(value: unknown, path: string, problems: CslValidationProblem[]): void {
  if (!isObject(value)) {
    problems.push({
      path,
      message: t({ message: "must be an object", context: "CSL validation" }),
    });
    return;
  }
  for (const [field, candidate] of Object.entries(value)) {
    if (nameStringFields.has(field)) {
      expectString(candidate, `${path}.${field}`, problems);
    } else if (nameFlagFields.has(field)) {
      expectScalar(candidate, `${path}.${field}`, problems);
    } else {
      problems.push({
        path: `${path}.${field}`,
        message: t({ message: "is not a CSL name field", context: "CSL validation" }),
      });
    }
  }
}

function validateDate(value: unknown, path: string, problems: CslValidationProblem[]): void {
  if (!isObject(value)) {
    problems.push({
      path,
      message: t({ message: "must be a CSL date object", context: "CSL validation" }),
    });
    return;
  }
  for (const [field, candidate] of Object.entries(value)) {
    validateDateField(field, candidate, path, problems);
  }
}

function validateDateField(
  field: string,
  value: unknown,
  path: string,
  problems: CslValidationProblem[],
): void {
  const fieldPath = `${path}.${field}`;
  if (field === "date-parts") {
    validateDateParts(value, fieldPath, problems);
  } else if (field === "raw" || field === "literal") {
    expectString(value, fieldPath, problems);
  } else if (field === "season") {
    expectStringOrNumber(value, fieldPath, problems);
  } else if (field === "circa") {
    expectScalar(value, fieldPath, problems);
  } else {
    problems.push({
      path: fieldPath,
      message: t({ message: "is not a CSL date field", context: "CSL validation" }),
    });
  }
}

function validateDateParts(value: unknown, path: string, problems: CslValidationProblem[]): void {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    problems.push({
      path,
      message: t({ message: "must contain one or two date ranges", context: "CSL validation" }),
    });
    return;
  }
  value.forEach((part, index) => {
    if (!validDatePart(part)) {
      problems.push({
        path: `${path}[${String(index)}]`,
        message: t({
          message: "must contain one to three string or number date parts",
          context: "CSL validation",
        }),
      });
    }
  });
}

function validDatePart(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 3 &&
    value.every((item) => typeof item === "string" || typeof item === "number")
  );
}

function validateStringArray(value: unknown, path: string, problems: CslValidationProblem[]): void {
  if (!Array.isArray(value) || value.some((candidate) => typeof candidate !== "string")) {
    problems.push({
      path,
      message: t({ message: "must be an array of strings", context: "CSL validation" }),
    });
  }
}

function expectString(value: unknown, path: string, problems: CslValidationProblem[]): void {
  if (typeof value !== "string") {
    problems.push({ path, message: t({ message: "must be a string", context: "CSL validation" }) });
  }
}

function expectStringOrNumber(
  value: unknown,
  path: string,
  problems: CslValidationProblem[],
): void {
  if (typeof value !== "string" && typeof value !== "number") {
    problems.push({
      path,
      message: t({ message: "must be a string or number", context: "CSL validation" }),
    });
  }
}

function expectScalar(value: unknown, path: string, problems: CslValidationProblem[]): void {
  if (!["string", "number", "boolean"].includes(typeof value)) {
    problems.push({ path, message: t({ message: "must be scalar", context: "CSL validation" }) });
  }
}

export function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isJsonValue(value: unknown): boolean {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return typeof value !== "number" || Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return isObject(value) && Object.values(value).every(isJsonValue);
}
