import { describe, expect, it } from "vitest";

import { epubDetails } from "./epub-details.js";
import { epubCoverImage } from "./epub-manifest.js";

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

describe("EPUB cover image", () => {
  const container = `<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`;
  const reader = (opf: string): { readText: (path: string) => Promise<string> } => {
    const files = new Map([
      ["META-INF/container.xml", container],
      ["OEBPS/content.opf", opf],
    ]);
    return { readText: (path) => Promise.resolve(files.get(path) ?? "") };
  };

  it("finds an EPUB 3 cover-image item, resolved against the package", async () => {
    await expect(
      epubCoverImage(
        reader(`<package><manifest>
          <item id="c" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>
        </manifest></package>`),
      ),
    ).resolves.toEqual({ path: "OEBPS/images/cover.jpg", mediaType: "image/jpeg" });
  });

  it("falls back to EPUB 2 cover metadata and ignores non-image covers", async () => {
    await expect(
      epubCoverImage(
        reader(`<package><metadata><meta name="cover" content="art"/></metadata><manifest>
          <item id="art" href="art.png" media-type="image/png"/>
        </manifest></package>`),
      ),
    ).resolves.toEqual({ path: "OEBPS/art.png", mediaType: "image/png" });
    await expect(
      epubCoverImage(
        reader(`<package><metadata><meta name="cover" content="page"/></metadata><manifest>
          <item id="page" href="cover.xhtml" media-type="application/xhtml+xml"/>
        </manifest></package>`),
      ),
    ).resolves.toBeNull();
  });
});
