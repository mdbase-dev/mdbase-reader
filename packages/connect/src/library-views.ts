import { connectOptions, outcomeValue } from "./repository-client.js";

import type {
  ExecuteViewInput,
  JsonObject,
  MdbaseConnection,
  SavedViewExecution,
  SavedViewList,
} from "@mdbase-dev/connect";
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

export function connectLibraryViewRepository(connection: MdbaseConnection): LibraryViewRepository {
  return {
    async list(options = {}) {
      return outcomeValue(
        await connection.listViews(connectOptions(options)),
        "list library views",
      );
    },
    async execute(input, options = {}) {
      return outcomeValue(
        await connection.executeView(input, connectOptions(options)),
        "execute library view",
      );
    },
    async save({ path, frontmatter, replace }) {
      const saved = replace
        ? outcomeValue(
            await connection.update({
              path,
              // A view is replaced whole, so fields the new definition drops are removed.
              document: await viewDocument(frontmatter),
              ...(replace.revision ? { ifRevision: replace.revision } : {}),
            }),
            "save library view",
          )
        : outcomeValue(await connection.create({ path, frontmatter }), "create library view");
      return { path: saved.path, revision: saved.revision };
    },
  };
}

/** YAML is only needed when replacing a view, so it loads on demand. */
async function viewDocument(frontmatter: JsonObject): Promise<string> {
  const { stringify } = await import("yaml");
  return `---\n${stringify(frontmatter).trimEnd()}\n---\n\n`;
}
