import type { ReaderRequestOptions } from "./ports.js";
import type { CollectionId } from "../domain/identity.js";
import type { SourceSummary } from "../domain/source.js";

/** Targeted source queries a store can answer without a library scan. */
export interface SourceLookups {
  /** Find a source saved from this page (see `normalizedSourceUrl`). */
  findByUrl?(
    collectionId: CollectionId,
    url: string,
    options?: ReaderRequestOptions,
  ): Promise<SourceSummary | null>;
  /** Sources whose citekey starts with `prefix`, for choosing an unused citekey. */
  findByCitekeyPrefix?(
    collectionId: CollectionId,
    prefix: string,
    options?: ReaderRequestOptions,
  ): Promise<readonly SourceSummary[]>;
}
