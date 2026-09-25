import { CapturePolicyError } from "./public-url.js";

export const MAX_PDF_CAPTURE_BYTES = 50 * 1024 * 1024;

const pdfSignature = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

/** Servers label PDFs inconsistently, so the bytes decide; these types are worth checking. */
export function mayBePdf(mediaType: string | undefined): boolean {
  return (
    mediaType === "application/pdf" ||
    mediaType === "application/x-pdf" ||
    mediaType === "application/octet-stream" ||
    mediaType === "binary/octet-stream" ||
    mediaType === undefined
  );
}

/**
 * Streams a PDF response without buffering it: the first bytes must be a PDF signature and the
 * total is capped, erroring the stream (and so the download) if the cap is passed.
 */
export async function boundedPdfStream(response: Response): Promise<ReadableStream<Uint8Array>> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PDF_CAPTURE_BYTES) {
    throw pdfTooLarge();
  }
  if (!response.body) {
    throw new CapturePolicyError("empty_response", "That address returned no content.", 422);
  }
  const reader = response.body.getReader();
  const head = await leadingBytes(reader, pdfSignature.length);
  if (!pdfSignature.every((byte, index) => head[index] === byte)) {
    await reader.cancel();
    throw new CapturePolicyError(
      "unsupported_content_type",
      "That address did not return an HTML page or a PDF.",
      415,
    );
  }
  let length = head.byteLength;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(head);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      length += value.byteLength;
      if (length > MAX_PDF_CAPTURE_BYTES) {
        await reader.cancel();
        controller.error(pdfTooLarge());
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

async function leadingBytes(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  count: number,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (length < count) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    length += value.byteLength;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function pdfTooLarge(): CapturePolicyError {
  return new CapturePolicyError(
    "capture_too_large",
    "That PDF is larger than Reader's 50 MB capture limit.",
    413,
  );
}
