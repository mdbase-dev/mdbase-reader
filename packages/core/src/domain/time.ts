import { DomainError } from "./errors.js";

declare const dateTimeBrand: unique symbol;

export type DateTime = string & { readonly [dateTimeBrand]: "DateTime" };

export function dateTime(value: string): DateTime {
  if (!/^\d{4}-\d{2}-\d{2}T/u.test(value) || Number.isNaN(Date.parse(value))) {
    throw new DomainError("invalid-datetime", "A datetime must be a valid ISO 8601 value.");
  }
  return value as DateTime;
}
