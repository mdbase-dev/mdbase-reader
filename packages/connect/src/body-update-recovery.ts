import { resolveAnnotationSource } from "./annotation-source.js";
import { annotationFromDocument, sourceFromDocument } from "./mapping.js";
import { settledRecord } from "./repository-client.js";

import type { MdbaseClient } from "@mdbase-dev/sdk";
import type { Annotation, BodyUpdateRecovery, RecoverBodyInput, Source } from "@mdbase-reader/core";

/** Existing repository recovery observes the SDK's original mutation. Editors use record leases. */
export class ConnectBodyUpdateRecovery implements BodyUpdateRecovery {
  constructor(private readonly client: MdbaseClient) {}
  async recoverSource(input: RecoverBodyInput): Promise<Source> {
    return sourceFromDocument(
      input.collectionId,
      await settledRecord(this.client, input.requestId),
    );
  }
  async recoverAnnotation(input: RecoverBodyInput): Promise<Annotation> {
    const record = await settledRecord(this.client, input.requestId);
    return annotationFromDocument(
      input.collectionId,
      record,
      await resolveAnnotationSource(this.client, record.path),
    );
  }
  pending(requestId: string): boolean {
    return this.client.ledger
      .getSnapshot()
      .pending.some(({ mutationId }) => mutationId === requestId);
  }
}
