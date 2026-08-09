import type { FileId } from "./identity.js";
import type { FileRevision } from "./revision.js";

export const documentRoles = ["primary", "alternate", "supplement", "original", "reading"] as const;
export type DocumentRole = (typeof documentRoles)[number];

export interface DocumentDescriptor {
  readonly fileId: FileId;
  readonly file: string;
  readonly revision: FileRevision;
  readonly mediaType: string;
  readonly role: DocumentRole;
  readonly title?: string;
}

export interface DocumentTarget {
  readonly fileId: FileId;
  readonly file: string;
  readonly revision: FileRevision;
}
