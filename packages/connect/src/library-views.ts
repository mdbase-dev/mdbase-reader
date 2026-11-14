import type { JsonObject, MdbaseClient } from "@mdbase-dev/sdk";

export interface LibraryViewSaveInput {
  readonly path: string;
  readonly frontmatter: JsonObject;
  readonly replace?: { readonly revision?: string };
}
export interface SavedLibraryView {
  readonly path: string;
  readonly revision: string;
}
export type LibraryViewRepository = Pick<MdbaseClient["views"], "list" | "execute"> & {
  save(input: LibraryViewSaveInput): Promise<SavedLibraryView>;
};
