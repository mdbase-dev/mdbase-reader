import { pathKey } from "./record-names.js";

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

/**
 * A document is its `file` link: the file at that path, whatever bytes it holds now.
 * `revision` says which bytes a position was recorded against. `fileId` is the ID
 * Connect gave the file when it was recorded; it is a lookup hint only, because a
 * daemon can assign new IDs to unchanged files and other tools never know them.
 */
export interface DocumentDescriptor {
  readonly fileId?: FileId;
  readonly file: string;
  readonly revision: FileRevision;
  readonly mediaType: string;
  readonly role: DocumentRole;
  readonly title?: string;
  readonly range?: DocumentRange;
}

export interface DocumentTarget {
  readonly fileId?: FileId;
  readonly file: string;
  readonly revision: FileRevision;
}

const uriScheme = /^[a-z][a-z0-9+.-]*:/iu;

/**
 * The collection path a document's `file` link names, as written: the target of a
 * wikilink or Markdown link (without anchor or alias), or a bare path. Reader writes
 * these links from the collection root, so no resolution against a folder is needed.
 */
export function documentPath(file: string): string {
  const value = file.trim();
  const wikilink = /^!?\[\[(.+?)\]\]$/u.exec(value);
  if (wikilink) {
    return withoutAnchor((wikilink[1] ?? "").split("|")[0] ?? "");
  }
  const markdown = /^!?\[[^\][\n]*\]\((.*)\)$/u.exec(value);
  if (markdown) {
    const destination = (markdown[1] ?? "").trim();
    if (destination.startsWith("#") || uriScheme.test(destination)) {
      return "";
    }
    const angled = /^<([^>]*)>/u.exec(destination);
    return withoutAnchor(
      angled ? (angled[1] ?? "") : (destination.split(" ")[0] ?? "").replaceAll("%20", " "),
    );
  }
  // A bare path is never bracketed and never a URI; anything else names no file.
  return /[[\]\n]/u.test(value) || uriScheme.test(value) ? "" : withoutAnchor(value);
}

function withoutAnchor(target: string): string {
  return (target.split("#")[0] ?? "").trim().replace(/^\.?\//u, "");
}

/** A key equal for two documents exactly when they name the same file. */
export function documentKey(document: Pick<DocumentTarget, "file">): string {
  return pathKey(documentPath(document.file));
}

/** Whether two document references name the same file, whatever their recorded IDs. */
export function sameDocument(
  left: Pick<DocumentTarget, "file"> | undefined,
  right: Pick<DocumentTarget, "file"> | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return false;
  }
  const key = documentKey(left);
  return key !== "" && key === documentKey(right);
}

/**
 * Marks page text that a saved web copy keeps but does not show as part of the article.
 * Keeping it means any passage selected on the live page can still be found in the copy.
 */
export const outsideArticleAttribute = "data-reader-outside";
