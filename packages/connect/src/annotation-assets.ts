import type { FileView, UploadOptions } from "@mdbase-dev/sdk";
import type { AnnotationAssetRepository } from "@mdbase-reader/core";

export interface ReaderAssetClient {
  upload(path: string, source: Blob, options?: UploadOptions): Promise<FileView>;
}

export class ConnectAnnotationAssetRepository implements AnnotationAssetRepository {
  public constructor(private readonly files: ReaderAssetClient) {}

  public async store(input: Parameters<AnnotationAssetRepository["store"]>[0]): Promise<void> {
    const content = input.bytes.slice().buffer;
    await this.files.upload(input.path, new Blob([content], { type: input.mediaType }), {
      transferId: input.idempotencyKey,
    });
  }
}
