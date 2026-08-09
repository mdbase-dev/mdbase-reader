import type {
  CollectionFileDescriptor,
  MdbaseConnection,
  MdbaseFileUploadOptions,
} from "@mdbase-dev/connect";
import type { AnnotationAssetRepository } from "@mdbase-reader/core";

export interface ReaderAssetClient {
  upload(
    path: string,
    source: Blob,
    options?: MdbaseFileUploadOptions,
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

export function connectAnnotationAssetRepository(
  connection: MdbaseConnection,
): ConnectAnnotationAssetRepository {
  return new ConnectAnnotationAssetRepository(connection.files);
}
