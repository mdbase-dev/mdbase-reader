import { describe, expect, it } from "vitest";

import { buildEpubManifest, type EpubPackageReader } from "./epub-manifest.js";

const container = `<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

describe("buildEpubManifest", () => {
  it("builds an EPUB 3 reading order, resources, metadata, and nested navigation", async () => {
    const files = new Map([
      ["META-INF/container.xml", container],
      [
        "OEBPS/content.opf",
        `<?xml version="1.0"?>
        <package xmlns="http://www.idpf.org/2007/opf" page-progression-direction="rtl">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title>Collected Essays</dc:title><dc:identifier>urn:book:1</dc:identifier>
            <dc:language>en</dc:language><dc:creator>Ursula Writer</dc:creator>
            <meta property="rendition:layout">reflowable</meta>
          </metadata>
          <manifest>
            <item id="chapter" href="text/chapter.xhtml" media-type="application/xhtml+xml"/>
            <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
            <item id="style" href="styles/book.css" media-type="text/css"/>
          </manifest>
          <spine><itemref idref="chapter"/></spine>
        </package>`,
      ],
      [
        "OEBPS/nav.xhtml",
        `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
        <body><nav epub:type="toc"><ol><li><a href="text/chapter.xhtml#opening">Opening</a>
        <ol><li><a href="text/chapter.xhtml#detail">Detail</a></li></ol></li></ol></nav></body></html>`,
      ],
    ]);

    const result = await buildEpubManifest(reader(files), "https://reader.test/book/");

    expect(result.manifest).toMatchObject({
      metadata: {
        title: "Collected Essays",
        identifier: "urn:book:1",
        language: ["en"],
        author: [{ name: "Ursula Writer" }],
        layout: "reflowable",
        readingProgression: "rtl",
      },
      readingOrder: [
        {
          href: "https://reader.test/book/OEBPS/text/chapter.xhtml",
          type: "application/xhtml+xml",
        },
      ],
      toc: [
        {
          title: "Opening",
          href: "https://reader.test/book/OEBPS/text/chapter.xhtml#opening",
          children: [
            {
              title: "Detail",
              href: "https://reader.test/book/OEBPS/text/chapter.xhtml#detail",
            },
          ],
        },
      ],
    });
    expect(result.mediaTypes.get("OEBPS/styles/book.css")).toBe("text/css");
  });

  it("uses the EPUB 2 NCX navigation document", async () => {
    const files = new Map([
      ["META-INF/container.xml", container],
      [
        "OEBPS/content.opf",
        `<package xmlns="http://www.idpf.org/2007/opf">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Legacy Book</dc:title></metadata>
        <manifest>
          <item id="one" href="one.xhtml" media-type="application/xhtml+xml"/>
          <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
        </manifest><spine toc="ncx"><itemref idref="one"/></spine>
      </package>`,
      ],
      [
        "OEBPS/toc.ncx",
        `<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>
        <navPoint><navLabel><text>Chapter one</text></navLabel><content src="one.xhtml#start"/></navPoint>
      </navMap></ncx>`,
      ],
    ]);

    const result = await buildEpubManifest(reader(files), "https://reader.test/legacy/");

    expect(result.manifest).toMatchObject({
      metadata: { title: "Legacy Book" },
      toc: [
        {
          title: "Chapter one",
          href: "https://reader.test/legacy/OEBPS/one.xhtml#start",
        },
      ],
    });
  });
});

function reader(files: ReadonlyMap<string, string>): EpubPackageReader {
  return {
    readText(path: string): Promise<string> {
      const value = files.get(path);
      if (value === undefined) {
        return Promise.reject(new Error(`Missing fixture: ${path}`));
      }
      return Promise.resolve(value);
    },
  };
}
