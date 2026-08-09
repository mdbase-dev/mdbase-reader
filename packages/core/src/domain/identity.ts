import { DomainError } from "./errors.js";

declare const identityBrand: unique symbol;

type Identity<Name extends string> = string & { readonly [identityBrand]: Name };

export type CollectionId = Identity<"CollectionId">;
export type SourceId = Identity<"SourceId">;
export type AnnotationId = Identity<"AnnotationId">;
export type FileId = Identity<"FileId">;
export type MutationId = Identity<"MutationId">;
export type RecordRevision = Identity<"RecordRevision">;

function identity<Name extends string>(value: string, name: Name): Identity<Name> {
  const normalized = value.trim();
  const containsControlCharacter = Array.from(normalized).some(
    (character) => character.charCodeAt(0) <= 31,
  );
  if (normalized.length === 0 || containsControlCharacter) {
    throw new DomainError("invalid-identifier", `${name} must be a non-empty printable value.`);
  }
  return normalized as Identity<Name>;
}

export const collectionId = (value: string): CollectionId => identity(value, "CollectionId");
export const sourceId = (value: string): SourceId => identity(value, "SourceId");
export const annotationId = (value: string): AnnotationId => identity(value, "AnnotationId");
export const fileId = (value: string): FileId => identity(value, "FileId");
export const mutationId = (value: string): MutationId => identity(value, "MutationId");
export const recordRevision = (value: string): RecordRevision => identity(value, "RecordRevision");
