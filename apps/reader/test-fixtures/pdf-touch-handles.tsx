// Isolated, synthetic, dev-only fixture. No Connect account or library data involved.
import {
  annotationId,
  collectionId,
  dateTime,
  fileId,
  fileRevision,
  sourceId,
} from "@mdbase-reader/core";
import { PdfViewerSurface } from "@mdbase-reader/renderer-pdf";
import { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import type { ReadingSurface, TextSelectionDraft } from "@mdbase-reader/reading-surface";

function testPdf(): Blob {
  const lines = Array.from(
    { length: 32 },
    (_, i) => `Line ${String(i + 1).padStart(2, "0")}: Alpha bravo charlie delta echo.`,
  );
  const stream = (page: number): string =>
    `BT /F1 12 Tf 28 660 Td 18 TL (${page === 1 ? "Page one" : "Page two"}: touch selection test) Tj\n${lines.map((line) => `T* (${line}) Tj`).join("\n")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    ...[5, 6].map(
      (content) =>
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 700] /Resources << /Font << /F1 7 0 R >> >> /Contents ${String(content)} 0 R >>`,
    ),
    ...[1, 2].map(
      (page) => `<< /Length ${String(stream(page).length)} >>\nstream\n${stream(page)}\nendstream`,
    ),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf += `${String(i + 1)} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${String(offsets.length)}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${String(offsets.length)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}
const target = {
  fileId: fileId("test-pdf"),
  file: "test.pdf",
  revision: fileRevision(`sha256:${"1".repeat(64)}`),
};
const document = {
  document: target,
  mediaType: "application/pdf",
  url: URL.createObjectURL(testPdf()),
};

function Fixture(): React.JSX.Element {
  const surface = useRef<ReadingSurface | null>(null);
  const [draft, setDraft] = useState<TextSelectionDraft | null>(null);
  const [saved, setSaved] = useState("");
  const [status, setStatus] = useState("Loading PDF");
  const ready = useCallback((value: ReadingSurface): void => {
    surface.current = value;
    value.capabilities.textSelection?.selections.subscribe(setDraft);
    value.capabilities.textSelection?.cleared?.subscribe(() => setDraft(null));
  }, []);
  const save = (): void => {
    if (!draft) {
      return;
    }
    setSaved(draft.target.quote.exact);
    void surface.current?.capabilities.decorations?.setAnnotations([
      {
        id: annotationId("test-highlight"),
        collectionId: collectionId("test"),
        sourceId: sourceId("test"),
        source: "[[test]]",
        annotationType: "highlight",
        color: "yellow",
        target: draft.target,
        document: target,
        body: draft.target.quote.exact,
        tags: [],
        createdAt: dateTime("2026-01-01T00:00:00Z"),
      },
    ]);
    surface.current?.capabilities.textSelection?.clearSelection();
  };
  return (
    <main
      style={{ height: "100dvh", display: "flex", flexDirection: "column", font: "14px system-ui" }}
    >
      <header
        style={{
          padding: "8px 12px",
          background: "#f1f5f9",
          height: 104,
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        <strong>PDF touch-handle prototype</strong> <span data-testid="status">{status}</span>
        <div>Hold a word, release, then drag either blue handle.</div>
        <button type="button" disabled={!draft} onClick={save}>
          Save highlight
        </button>
        <output data-testid="quote" style={{ display: "block", maxHeight: 40, overflow: "auto" }}>
          {draft?.target.quote.exact ?? ""}
        </output>
        <output data-testid="saved" hidden>
          {saved}
        </output>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        <PdfViewerSurface
          document={document}
          onSurfaceReady={ready}
          onDocumentReady={() => setStatus("Ready")}
          onDocumentError={setStatus}
        />
      </div>
    </main>
  );
}

const root = window.document.getElementById("root");
if (root) {
  createRoot(root).render(<Fixture />);
}
