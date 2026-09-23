import { degrees, PDFDocument, PDFName, PDFNumber } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { hash } from "./model.js";
import { fixture } from "./tests/zotero-fixture.js";
import { readZoteroBundle } from "./zotero-bundle.js";
import { convertZoteroPdfPosition, readPdfGeometry } from "./zotero-pdf.js";
import { planZotero } from "./zotero.js";

const page = { left: 10, bottom: 20, right: 210, top: 320, rotation: 0 };
const position = { pageIndex: 0, rects: [[30, 50, 70, 80]] };

describe("Zotero PDF anchors", () => {
  it.each([
    [0, [20, 240, 60, 240, 20, 270, 60, 270]],
    [90, [30, 20, 60, 20, 30, 60, 60, 60]],
    [180, [140, 30, 180, 30, 140, 60, 180, 60]],
    [270, [240, 140, 270, 140, 240, 180, 270, 180]],
  ])("converts crop offsets and intrinsic rotation %s", (rotation, quad) => {
    const result = convertZoteroPdfPosition(
      JSON.stringify(position),
      [{ ...page, rotation: rotation }],
      "highlight",
    );
    expect(result).toEqual({
      page_index: 0,
      coordinate_space: {
        profile: "embedpdf-selection-page-points-v1",
        box: "crop",
        origin: "top_left",
      },
      quad_points: [quad],
    });
  });

  it("keeps separate line rectangles and uses the area profile for images", () => {
    const result = convertZoteroPdfPosition(
      { ...position, rects: [...position.rects, [30, 90, 70, 100]] },
      [page],
      "image",
    );
    expect(result["quad_points"]).toHaveLength(2);
    expect(result["coordinate_space"]).toMatchObject({
      profile: "embedpdf-capture-page-points-v1",
    });
  });

  it.each([
    { ...position, pageIndex: -1 },
    { ...position, pageIndex: 1 },
    { ...position, pageIndex: 0.5 },
    { ...position, rects: [] },
    { ...position, rects: [[1, 2, 1, 4]] },
    { ...position, rects: [[1, 2, Infinity, 4]] },
    { ...position, nextPageRects: [[1, 2, 3, 4]] },
    { pageIndex: 0, paths: [[1, 2, 3, 4]] },
    { type: "FragmentSelector", value: "epubcfi(...)" },
  ])("does not invent geometry for invalid/unsupported positions %j", (raw) => {
    expect(() => convertZoteroPdfPosition(raw, [page], "highlight")).toThrow();
  });

  it("reads inherited PDF boxes, intersects crop with media, and never rewrites bytes", async () => {
    const pdf = await PDFDocument.create();
    const p = pdf.addPage([200, 300]);
    p.setMediaBox(10, 20, 200, 300);
    p.setCropBox(0, 40, 190, 400);
    p.setRotation(degrees(270));
    const parent = p.node.Parent();
    if (!parent) {
      throw new Error("Missing page-tree parent.");
    }
    for (const field of ["MediaBox", "CropBox", "Rotate"]) {
      const name = PDFName.of(field);
      const value = p.node.get(name);
      if (!value) {
        throw new Error("Missing inheritable value.");
      }
      parent.set(name, value);
      p.node.delete(name);
    }
    const blob = new Blob([new Uint8Array(await pdf.save())]);
    const before = await hash(blob);
    expect(await readPdfGeometry(blob)).toEqual([
      { left: 10, bottom: 40, right: 190, top: 320, rotation: 270 },
    ]);
    expect(await hash(blob)).toBe(before);
    p.node.set(PDFName.of("UserUnit"), PDFNumber.of(2));
    await expect(readPdfGeometry(new Blob([new Uint8Array(await pdf.save())]))).rejects.toThrow(
      "UserUnit",
    );
  });

  it("adds usable targets during planning while preserving quotes and native selectors", async () => {
    const input = await fixture();
    const pdf = await PDFDocument.create();
    pdf.addPage([200, 300]);
    const blob = new Blob([new Uint8Array(await pdf.save())]);
    input.set("files/ATT/document.pdf", blob);
    const manifest = JSON.parse(await input.get("manifest.json")!.text());
    manifest.files[0].bytes = blob.size;
    manifest.files[0].sha256 = await hash(blob);
    input.set("manifest.json", new Blob([JSON.stringify(manifest)]));
    const bundle = await readZoteroBundle(input, new AbortController().signal, () => undefined);
    const plan = await planZotero(bundle);
    const target = plan.annotations.find((a) => a.key === "ANN")?.fields["target"];
    expect(target).toMatchObject({
      quote: { exact: "Exact quotation" },
      zotero: { position: '{"pageIndex":0,"rects":[[1,2,3,4]]}' },
      pdf: { page_index: 0, quad_points: [[1, 296, 3, 296, 1, 298, 3, 298]] },
    });
    expect(plan.warnings.join(" ")).toContain("1 Zotero PDF annotations");
  });
});
