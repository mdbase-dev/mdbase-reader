import {
  ConnectOperationScheduler,
  readerConnectGlobalConcurrency,
} from "./operation-scheduler.js";
import { outcomeValue, retryRejectedConnectorBusy } from "./repository-client.js";

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

export function connectLibraryViewRepository(
  connection: MdbaseConnection,
  scheduler = new ConnectOperationScheduler(readerConnectGlobalConcurrency),
): LibraryViewRepository {
  return {
    async list(options = {}) {
      return outcomeValue(
        await retryRejectedConnectorBusy(
          () => scheduler.run(() => connection.listViews(options), { signal: options.signal }),
          options,
        ),
        "list library views",
      );
    },
    async execute(input, options = {}) {
      return outcomeValue(
        await retryRejectedConnectorBusy(
          () =>
            scheduler.run(() => connection.executeView(input, options), {
              signal: options.signal,
            }),
          options,
        ),
        "execute library view",
      );
    },
    async save(input) {
      if (input.path) {
        const path = input.path;
        return outcomeValue(
          await retryRejectedConnectorBusy(() =>
            scheduler.run(
              () =>
                connection.updateViewSource({
                  path,
                  document: input.document,
                  ...(input.revision ? { ifRevision: input.revision } : {}),
                }),
              { priority: "foreground" },
            ),
          ),
          "save library view",
        );
      }
      return outcomeValue(
        await retryRejectedConnectorBusy(() =>
          scheduler.run(
            () =>
              connection.createViewSource({
                document: input.document,
                ...(input.name ? { name: input.name } : {}),
                format: "mdbase.view",
              }),
            { priority: "foreground" },
          ),
        ),
        "create library view",
      );
    },
  };
}
