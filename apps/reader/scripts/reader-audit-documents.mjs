import { ZipWriter, Uint8ArrayWriter, TextReader } from "@zip.js/zip.js";

export function auditPdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const pages = [];
  for (let page = 1; page <= 8; page += 1) {
    const id = objects.length + 1;
    pages.push(`${id} 0 R`);
    const text = `BT /F1 18 Tf 60 700 Td ([test] PDF reading fixture - Page ${page}) Tj 0 -35 Td (Patient attention and durable research notes.) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`,
    );
    objects.push(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${pages.join(" ")}] /Count ${pages.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

export async function auditEpub() {
  const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false, level: 0 });
  const entries = {
    mimetype: "application/epub+zip",
    "META-INF/container.xml":
      '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    "OEBPS/content.opf":
      '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">test-reader-epub</dc:identifier><dc:title>[test] EPUB reading fixture</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-09-01T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>',
    "OEBPS/nav.xhtml":
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Reading</a></li></ol></nav></body></html>',
    "OEBPS/chapter.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Reading</title></head><body><h1>[test] EPUB reading fixture</h1>${Array.from({ length: 30 }, (_, index) => `<p>Patient attention and durable research notes. This is disposable test paragraph ${index + 1}.</p>`).join("")}</body></html>`,
  };
  for (const [path, content] of Object.entries(entries)) {
    await writer.add(path, new TextReader(content));
  }
  return Buffer.from(await writer.close());
}
