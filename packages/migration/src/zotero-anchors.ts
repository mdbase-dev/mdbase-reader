import { format, object, text, type MigrationPlan } from "./model.js";
import { convertZoteroPdfPosition, readPdfGeometry, type PdfPageGeometry } from "./zotero-pdf.js";

import type { ZoteroBundle } from "./zotero-bundle.js";

export async function addZoteroPdfTargets(
  bundle: ZoteroBundle,
  plan: MigrationPlan,
): Promise<void> {
  const geometry = new Map<string, PdfPageGeometry[] | null>();
  const annotations = new Map(plan.annotations.map((annotation) => [annotation.key, annotation]));
  const attachments = new Map(
    bundle.rows.attachments.map((attachment) => [attachment.key, attachment]),
  );
  let converted = 0;
  let unresolved = 0;
  for (const row of bundle.rows.annotations) {
    const attachment = attachments.get(text(row.zotero["parentItem"]));
    const annotation = annotations.get(row.key);
    if (
      !attachment?.path ||
      !annotation ||
      format(attachment.path, text(attachment.zotero["contentType"])) !== "pdf"
    ) {
      unresolved++;
      continue;
    }
    if (!geometry.has(attachment.path)) {
      const blob = bundle.files.get(attachment.path);
      try {
        geometry.set(attachment.path, blob ? await readPdfGeometry(blob) : null);
      } catch {
        geometry.set(attachment.path, null);
      }
    }
    const pages = geometry.get(attachment.path);
    try {
      if (!pages) {
        throw new Error("PDF geometry unavailable.");
      }
      object(annotation.fields["target"])["pdf"] = convertZoteroPdfPosition(
        row.zotero["annotationPosition"],
        pages,
        text(row.zotero["annotationType"]),
      );
      converted++;
    } catch {
      unresolved++;
    }
  }
  plan.warnings.push(
    `${String(converted)} Zotero PDF annotations have converted page/rectangle anchors. ${String(unresolved)} retain native selectors only (missing/unreadable PDFs, unsupported geometry, ink, or non-PDF annotations). Image crops are not generated.`,
  );
}
