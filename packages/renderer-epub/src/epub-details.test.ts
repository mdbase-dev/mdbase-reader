import { describe, expect, it } from "vitest";

import { epubDetails } from "./epub-details.js";

describe("EPUB details", () => {
  it("reads Dublin Core metadata from the package the container names", async () => {
    const files = new Map([
      [
        "META-INF/container.xml",
        `<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`,
      ],
      [
        "OEBPS/content.opf",
        `<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata>
          <dc:title>Gravity and Grace</dc:title>
          <dc:creator opf:role="aut">Simone Weil</dc:creator>
          <dc:creator>Emma Crawford</dc:creator>
          <dc:identifier id="uid">urn:uuid:1234</dc:identifier>
          <dc:identifier opf:scheme="ISBN">978-0-415-29001-2</dc:identifier>
          <dc:language>en</dc:language>
          <dc:publisher>Routledge</dc:publisher>
          <dc:date>2002-01-01</dc:date>
          <dc:description>&lt;p&gt;Notebooks,  selected.&lt;/p&gt;</dc:description>
        </metadata></package>`,
      ],
    ]);
    const details = await epubDetails({
      readText: (path) => Promise.resolve(files.get(path) ?? ""),
    });
    expect(details).toEqual({
      title: "Gravity and Grace",
      authors: ["Simone Weil", "Emma Crawford"],
      language: "en",
      publisher: "Routledge",
      published: "2002-01-01",
      description: "Notebooks, selected.",
      identifiers: ["urn:uuid:1234", "978-0-415-29001-2"],
    });
  });
});
