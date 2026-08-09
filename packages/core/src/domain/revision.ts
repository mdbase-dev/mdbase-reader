import { DomainError } from "./errors.js";

declare const fileRevisionBrand: unique symbol;

export type FileRevision = string & { readonly [fileRevisionBrand]: "FileRevision" };

const sha256Pattern = /^sha256:[a-f0-9]{6,64}$/u;

export function fileRevision(value: string): FileRevision {
  const normalized = value.trim().toLowerCase();
  if (!sha256Pattern.test(normalized)) {
    throw new DomainError(
      "invalid-revision",
      "A file revision must be a lowercase SHA-256 value prefixed with sha256:.",
    );
  }
  return normalized as FileRevision;
}
