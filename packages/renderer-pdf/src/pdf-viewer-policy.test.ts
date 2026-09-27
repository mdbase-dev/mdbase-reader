import { LockModeType, type UISchema } from "@embedpdf/react-pdf-viewer";
import { describe, expect, it } from "vitest";

import {
  createReaderPdfViewerConfig,
  readerPdfDisabledCategories,
  readerPdfUiSchema,
} from "./pdf-viewer-policy.js";

const unsupportedCommandPrefixes = [
  "annotation:",
  "attachment:",
  "document:",
  "form:",
  "history:",
  "insert:",
  "mode:",
  "redaction:",
  "security:",
  "signature:",
  "stamp:",
] as const;

function commandIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(commandIds);
  }
  if (value === null || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  return [
    ...(typeof record["commandId"] === "string" ? [record["commandId"]] : []),
    ...Object.values(record).flatMap(commandIds),
  ];
}

describe("Reader EmbedPDF policy", () => {
  it("exposes only reading commands", () => {
    const commands = commandIds(readerPdfUiSchema);

    expect(commands).toEqual(
      expect.arrayContaining([
        "panel:toggle-sidebar",
        "panel:toggle-search",
        "selection:copy",
        "zoom:fit-page",
        "zoom:fit-width",
      ]),
    );
    expect(
      commands.filter((command) =>
        unsupportedCommandPrefixes.some((prefix) => command.startsWith(prefix)),
      ),
    ).toEqual([]);
  });

  it("keeps only document navigation, search, and copy surfaces", () => {
    const schema: UISchema = readerPdfUiSchema;

    expect(Object.keys(schema.toolbars)).toEqual(["main-toolbar"]);
    expect(Object.keys(schema.sidebars)).toEqual(["sidebar-panel", "search-panel"]);
    expect(Object.keys(schema.modals)).toEqual([]);
    expect(Object.keys(schema.overlays ?? {})).toEqual([]);
    expect(Object.keys(schema.selectionMenus)).toEqual(["selection"]);
    expect(commandIds(schema.selectionMenus)).toEqual(["selection:copy"]);
  });

  it("keeps zoom responsive without adding interaction-mode controls", () => {
    const breakpoints = readerPdfUiSchema.toolbars["main-toolbar"].responsive.breakpoints;

    expect(breakpoints.compact.hide).toContain("reader-zoom");
    expect(breakpoints.readingPane.show).toContain("reader-zoom");
    expect(commandIds(readerPdfUiSchema)).not.toEqual(
      expect.arrayContaining(["pan:toggle", "pointer:toggle"]),
    );
  });

  it("starts in text selection on touch-capable devices", () => {
    // With no mode control, EmbedPDF's touch-detected pan default would strand selection.
    expect(createReaderPdfViewerConfig("blob:reader-pdf").pan).toEqual({ defaultMode: "never" });
  });

  it("disables unsupported command families as well as hiding their UI", () => {
    expect(readerPdfDisabledCategories).toEqual(
      expect.arrayContaining([
        "annotation",
        "document",
        "form",
        "history",
        "insert",
        "mode",
        "redaction",
        "signature",
        "stamp",
      ]),
    );
  });

  it("creates an immutable, non-exporting viewer configuration", () => {
    const config = createReaderPdfViewerConfig("blob:reader-pdf");

    expect(config.src).toBe("blob:reader-pdf");
    expect(config.tabBar).toBe("never");
    expect(config.disabledCategories).toEqual(readerPdfDisabledCategories);
    expect(config.ui?.schema).toBe(readerPdfUiSchema);
    expect(config.annotations).toMatchObject({
      autoCommit: false,
      locked: { type: LockModeType.None },
    });
    expect(config.permissions?.overrides).toMatchObject({
      assembleDocument: false,
      fillForms: false,
      modifyContents: false,
    });
    expect(config.render).toEqual({ withAnnotations: false, withForms: false });
  });

  it("inherits mdbase tokens and does not load EmbedPDF webfonts", () => {
    const config = createReaderPdfViewerConfig("blob:reader-pdf");

    expect(config.fonts?.ui).toMatchObject({ stylesheetUrl: null });
    expect(config.fonts?.signature).toBeNull();
    expect(config.theme?.light?.background?.surface).toBe("var(--color-surface)");
    expect(config.theme?.dark?.accent?.primary).toBe("var(--color-accent)");
  });
});
