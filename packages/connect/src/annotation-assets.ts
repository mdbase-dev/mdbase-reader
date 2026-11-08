import type { CollectionFileDescriptor, FileUploadOptions } from "./connect-types.js";
import type { AnnotationAssetRepository } from "@mdbase-reader/core";

export interface ReaderAssetClient {
  upload(
    path: string,
    source: Blob,
    options?: FileUploadOptions,
  ): Promise<CollectionFileDescriptor>;
}

export class ConnectAnnotationAssetRepository implements AnnotationAssetRepository {
  public constructor(private readonly files: ReaderAssetClient) {}

  public async store(input: Parameters<AnnotationAssetRepository["store"]>[0]): Promise<void> {
    const content = input.bytes.slice().buffer;
    await this.files.upload(input.path, new Blob([content], { type: input.mediaType }), {
      mediaType: input.mediaType,
      transferId: input.idempotencyKey,
    });
  }
}
