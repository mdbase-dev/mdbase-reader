import type {
  ExecuteViewInput,
  JsonObject,
  SavedViewExecution,
  SavedViewList,
} from "./connect-types.js";
import type { ReaderRequestOptions } from "@mdbase-reader/core";

/** A saved view is an ordinary record whose type implements `mdbase.view`. */
export interface LibraryViewSaveInput {
  readonly path: string;
  readonly frontmatter: JsonObject;
  /** Present when replacing the view at `path`; its absence creates one there. */
  readonly replace?: { readonly revision?: string };
}

export interface SavedLibraryView {
  readonly path: string;
  readonly revision: string;
}

export interface LibraryViewRepository {
  list(options?: ReaderRequestOptions): Promise<SavedViewList>;
  execute(input: ExecuteViewInput, options?: ReaderRequestOptions): Promise<SavedViewExecution>;
  save(input: LibraryViewSaveInput): Promise<SavedLibraryView>;
}
