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
