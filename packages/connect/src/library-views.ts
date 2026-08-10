import { outcomeValue } from "./repository-client.js";

import type {
  ExecuteViewInput,
  MdbaseConnection,
  SavedViewExecution,
  SavedViewList,
  SavedViewSourceDocument,
} from "@mdbase-dev/connect";

export interface LibraryViewSaveInput {
  readonly document: string;
  readonly path?: string;
  readonly revision?: string;
  readonly name?: string;
}

export interface LibraryViewRepository {
  list(options?: { readonly signal?: AbortSignal }): Promise<SavedViewList>;
  execute(
    input: ExecuteViewInput,
    options?: { readonly signal?: AbortSignal },
  ): Promise<SavedViewExecution>;
  save(input: LibraryViewSaveInput): Promise<SavedViewSourceDocument>;
}

export function connectLibraryViewRepository(connection: MdbaseConnection): LibraryViewRepository {
  return {
    async list(options = {}) {
      return outcomeValue(await connection.listViews(options), "list library views");
    },
    async execute(input, options = {}) {
      return outcomeValue(await connection.executeView(input, options), "execute library view");
    },
    async save(input) {
      if (input.path) {
        return outcomeValue(
          await connection.updateViewSource({
            path: input.path,
            document: input.document,
            ...(input.revision ? { ifRevision: input.revision } : {}),
          }),
          "save library view",
        );
      }
      return outcomeValue(
        await connection.createViewSource({
          document: input.document,
          ...(input.name ? { name: input.name } : {}),
          format: "mdbase.view",
        }),
        "create library view",
      );
    },
  };
}
