import { MdbaseError } from "@mdbase-dev/sdk";

import type {
  Query,
  RecordReadOptions,
  PagesOptions,
  QueryResult,
  MdbaseClient,
} from "@mdbase-dev/sdk";

const optionIndex: Readonly<Record<string, number>> = {
  get: 1,
  find: 1,
  query: 1,
  queryContract: 1,
  getContract: 2,
  readMany: 1,
  create: 1,
  update: 2,
  replaceDocument: 2,
  delete: 1,
  settle: 1,
  receipt: 1,
  awaitReceipt: 1,
};

/** Keep the SDK's values and methods, while binding repository work to this opened scope. */
export function borrowedRecords(
  client: MdbaseClient,
  current: () => boolean,
  signal: AbortSignal,
): MdbaseClient {
  const check = (): void => {
    signal.throwIfAborted();
    if (!current()) {
      throw new MdbaseError({
        code: "cancelled",
        recovery: "none",
        message: "This collection is no longer open in mdbase Reader.",
      });
    }
  };
  return new Proxy(client, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== "function") {
        return value;
      }
      if (key === "pages") {
        return async function* (
          query: Query,
          options: RecordReadOptions & PagesOptions = {},
        ): AsyncGenerator<QueryResult> {
          check();
          for await (const page of target.pages(query, {
            ...options,
            signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal,
          })) {
            check();
            yield page;
          }
        };
      }
      if (typeof key !== "string" || !Object.hasOwn(optionIndex, key)) {
        return (value as (...args: unknown[]) => unknown).bind(target);
      }
      const invoke = value as (...args: unknown[]) => Promise<unknown>;
      return async (...args: unknown[]): Promise<unknown> => {
        check();
        const index = optionIndex[key];
        if (index === undefined) {
          throw new Error("Missing SDK method options index.");
        }
        const supplied = args[index] as { signal?: AbortSignal } | undefined;
        const requestSignal = supplied?.signal
          ? AbortSignal.any([signal, supplied.signal])
          : signal;
        args[index] = { ...supplied, signal: requestSignal };
        const result = await invoke.apply(target, args);
        check();
        return result;
      };
    },
  });
}
