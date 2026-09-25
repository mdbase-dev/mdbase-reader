import { useCallback, useMemo, useState } from "react";

import { readerErrorMessage } from "./errors.js";
import { droppedMediaType } from "./use-source-addition.js";

import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { SourceId, SourceSummary } from "@mdbase-reader/core";
import type { PickedFile } from "@mdbase-reader/platform";

export interface DocumentAttachmentState {
  readonly sourceId: SourceId;
  readonly busy: boolean;
  readonly message: string | null;
  readonly error: string | null;
}

/** Adds a document to a source that has none: a chosen file, or a free PDF found online. */
export interface DocumentAttachmentController {
  readonly canChooseFile: boolean;
  readonly state: DocumentAttachmentState | null;
  readonly chooseFile: (source: SourceSummary) => void;
  readonly dropFile: (source: SourceSummary, file: File) => void;
  /** Whether the source names a work that an open-access PDF could be found for. */
  readonly canFindPdf: (source: SourceSummary) => boolean;
  readonly findPdf: (source: SourceSummary) => void;
}

export function useDocumentAttachment(
  workspace: Pick<ReaderWorkspaceController, "attachSourceFile">,
  pickSourceFile: (() => Promise<PickedFile | null>) | undefined,
): DocumentAttachmentController | null {
  const [state, setState] = useState<DocumentAttachmentState | null>(null);
  const attach = workspace.attachSourceFile;

  const run = useCallback(
    async (
      source: SourceSummary,
      message: string,
      work: (report: (next: string) => void) => Promise<unknown>,
    ): Promise<void> => {
      const report = (next: string): void =>
        setState({ sourceId: source.id, busy: true, message: next, error: null });
      report(message);
      try {
        await work(report);
        setState(null);
      } catch (reason) {
        setState({
          sourceId: source.id,
          busy: false,
          message: null,
          error: readerErrorMessage(reason, "Reader could not attach a document."),
        });
      }
    },
    [],
  );

  const attachFile = useCallback(
    (source: SourceSummary, file: PickedFile): Promise<void> =>
      run(source, `Attaching ${file.name}…`, async () => {
        if (!attach) {
          throw new Error("This collection cannot attach files to existing sources.");
        }
        await attach({
          source,
          name: file.name,
          declaredMediaType: file.mediaType,
          bytes: new Uint8Array(file.bytes),
        });
      }),
    [attach, run],
  );

  return useMemo(() => {
    if (!attach) {
      return null;
    }
    return {
      canChooseFile: pickSourceFile !== undefined,
      state,
      chooseFile: (source) => {
        void pickSourceFile?.().then((file) => (file ? attachFile(source, file) : undefined));
      },
      dropFile: (source, file) => {
        const mediaType = droppedMediaType(file);
        if (!mediaType) {
          setState({
            sourceId: source.id,
            busy: false,
            message: null,
            error: `${file.name} isn’t a PDF, EPUB or saved web page.`,
          });
          return;
        }
        void file
          .arrayBuffer()
          .then((bytes) =>
            attachFile(source, { name: file.name, mediaType, size: file.size, bytes }),
          );
      },
      canFindPdf: (source) => Boolean(pdfSearchFor(source)),
      findPdf: (source) => {
        void run(source, "Looking for an open-access PDF…", async (report) => {
          const work = pdfSearchFor(source);
          if (!work) {
            throw new Error("This source has no DOI, arXiv ID or web address to search with.");
          }
          const [{ findOpenAccessPdf, pdfFileName }, { fetchCapture }] = await Promise.all([
            import("./open-access-pdf.js"),
            import("./web-capture-client.js"),
          ]);
          const pdf = await findOpenAccessPdf(work, { capture: fetchCapture });
          if (!pdf) {
            throw new Error(
              "No open-access PDF was found. Attach a copy you have, or save it from the publisher with the browser extension.",
            );
          }
          report("Attaching the PDF…");
          await attach({
            source,
            name: pdfFileName(pdf.canonicalUrl, source.title),
            declaredMediaType: "application/pdf",
            bytes: pdf.bytes,
            originUrl: pdf.canonicalUrl,
          });
        });
      },
    };
  }, [attach, attachFile, pickSourceFile, run, state]);
}

/** A DOI or arXiv ID from the citation or address, and the address itself to try. */
function pdfSearchFor(
  source: SourceSummary,
): { readonly doi?: string; readonly arxiv?: string; readonly pageUrl?: string } | null {
  const doi = typeof source.citation?.["DOI"] === "string" ? source.citation["DOI"] : undefined;
  const urls = [source.url, source.citation?.["URL"]].filter(
    (value): value is string => typeof value === "string" && /^https:\/\//iu.test(value),
  );
  const arxiv = urls
    .map((url) => /arxiv\.org\/(?:abs|pdf)\/([^/?#]+?)(?:\.pdf)?$/iu.exec(url)?.[1])
    .find(Boolean);
  const pageUrl = urls[0];
  if (!doi && !arxiv && !pageUrl) {
    return null;
  }
  return {
    ...(doi ? { doi } : {}),
    ...(arxiv ? { arxiv } : {}),
    ...(pageUrl ? { pageUrl } : {}),
  };
}
