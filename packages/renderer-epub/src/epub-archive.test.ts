import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js";
import { describe, expect, it } from "vitest";

import { EpubArchive } from "./epub-archive.js";

describe("EpubArchive", () => {
  it("inspects and reads a bounded EPUB archive", async () => {
    const writer = new ZipWriter(new BlobWriter("application/epub+zip"));
    await writer.add("mimetype", new TextReader("application/epub+zip"), { level: 0 });
    await writer.add(
      "META-INF/container.xml",
      new TextReader("<container><rootfiles/></container>"),
    );
    await writer.add("OEBPS/chapter.xhtml", new TextReader("<html><body>Chapter</body></html>"));
    const archive = await EpubArchive.open(await writer.close());

    expect(archive.entries.map(({ path }) => path)).toEqual([
      "mimetype",
      "META-INF/container.xml",
      "OEBPS/chapter.xhtml",
    ]);
    expect(await archive.readText("OEBPS/chapter.xhtml")).toContain("Chapter");
    await archive.close();
    await expect(archive.readText("OEBPS/chapter.xhtml")).rejects.toThrow(/closed/u);
  });

  it("rejects archives without the required container", async () => {
    const writer = new ZipWriter(new BlobWriter("application/epub+zip"));
    await writer.add("chapter.xhtml", new TextReader("<html/>"));

    await expect(EpubArchive.open(await writer.close())).rejects.toThrow(/container/u);
  });
});
