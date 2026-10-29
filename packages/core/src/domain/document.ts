import type { FileId } from "./identity.js";
import type { FileRevision } from "./revision.js";
import type { DocumentRange } from "./source-parts.js";

export const documentRoles = [
  "primary",
  "alternative",
  "archive",
  "readable",
  "transcript",
  "supplement",
  "cover",
  "attachment",
] as const;
export type DocumentRole = (typeof documentRoles)[number] | (string & {});

export interface DocumentDescriptor {
  readonly fileId: FileId;
  readonly file: string;
  readonly revision: FileRevision;
  readonly mediaType: string;
  readonly role: DocumentRole;
  readonly title?: string;
  readonly range?: DocumentRange;
}

export interface DocumentTarget {
  readonly fileId: FileId;
  readonly file: string;
  readonly revision: FileRevision;
}

/**
 * Marks page text that a saved web copy keeps but does not show as part of the article.
 * Keeping it means any passage selected on the live page can still be found in the copy.
 */
export const outsideArticleAttribute = "data-reader-outside";
