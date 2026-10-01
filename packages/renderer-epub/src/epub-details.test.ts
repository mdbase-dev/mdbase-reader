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
          <dc:title>Crime and Punishment</dc:title>
          <dc:creator opf:role="aut">Fyodor Dostoevsky</dc:creator>
          <dc:creator>Constance Garnett</dc:creator>
          <dc:identifier id="uid">urn:uuid:1234</dc:identifier>
          <dc:identifier opf:scheme="ISBN">978-0-14-044913-6</dc:identifier>
          <dc:language>en</dc:language>
          <dc:publisher>Heinemann</dc:publisher>
          <dc:date>2002-01-01</dc:date>
          <dc:description>&lt;p&gt;Notebooks,  selected.&lt;/p&gt;</dc:description>
        </metadata></package>`,
      ],
    ]);
    const details = await epubDetails({
      readText: (path) => Promise.resolve(files.get(path) ?? ""),
    });
    expect(details).toEqual({
      title: "Crime and Punishment",
      authors: ["Fyodor Dostoevsky", "Constance Garnett"],
      language: "en",
      publisher: "Heinemann",
      published: "2002-01-01",
      description: "Notebooks, selected.",
      identifiers: ["urn:uuid:1234", "978-0-14-044913-6"],
    });
  });
});
