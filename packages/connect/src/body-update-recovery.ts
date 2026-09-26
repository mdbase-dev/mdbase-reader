import { annotationFromDocument, sourceFromDocument } from "./mapping.js";
import { outcomeValue } from "./repository-client.js";

import type { MdbaseConnection, RecordDocument } from "@mdbase-dev/connect";
import type { Annotation, BodyUpdateRecovery, RecoverBodyInput, Source } from "@mdbase-reader/core";

/** Recovers interrupted body writes through the connection's durable pending mutations. */
export class ConnectBodyUpdateRecovery implements BodyUpdateRecovery {
  constructor(private readonly connection: Pick<MdbaseConnection, "pendingMutation">) {}

  async recoverSource(input: RecoverBodyInput): Promise<Source> {
    return sourceFromDocument(input.collectionId, await this.#recover(input.requestId));
  }

  async recoverAnnotation(input: RecoverBodyInput): Promise<Annotation> {
    return annotationFromDocument(input.collectionId, await this.#recover(input.requestId));
  }

  pending(requestId: string): boolean {
    return this.connection.pendingMutation(requestId) !== null;
  }

  async #recover(requestId: string): Promise<RecordDocument> {
    const pending = this.connection.pendingMutation<RecordDocument>(requestId);
    if (!pending) {
      throw new Error("The interrupted write is no longer pending. No new write was attempted.");
    }
    return outcomeValue(await pending.recover(), "recover an interrupted write");
  }
}
