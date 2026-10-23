import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import type { Locale } from "@embedpdf/react-pdf-viewer";
import type { MessageDescriptor } from "@lingui/core";

interface Phrase {
  readonly descriptor: MessageDescriptor;
  readonly parameters?: Record<string, string>;
}
interface PhraseDictionary {
  readonly [key: string]: Phrase | PhraseDictionary;
}

const phrases: PhraseDictionary = {
  search: {
    placeholder: { descriptor: msg({ message: "Search", context: "PDF viewer search" }) },
    caseSensitive: { descriptor: msg({ message: "Case sensitive", context: "PDF viewer search" }) },
    wholeWord: { descriptor: msg({ message: "Whole word", context: "PDF viewer search" }) },
    resultsFound: {
      descriptor: msg({ message: "{count} results found", context: "PDF viewer search" }),
      parameters: { count: "{count}" },
    },
    page: {
      descriptor: msg({ message: "Page {page}", context: "PDF viewer search" }),
      parameters: { page: "{page}" },
    },
  },
  zoom: {
    in: { descriptor: msg({ message: "Zoom In", context: "PDF viewer zoom" }) },
    out: { descriptor: msg({ message: "Zoom Out", context: "PDF viewer zoom" }) },
    fitWidth: { descriptor: msg({ message: "Fit to Width", context: "PDF viewer zoom" }) },
    fitPage: { descriptor: msg({ message: "Fit to Page", context: "PDF viewer zoom" }) },
    marquee: { descriptor: msg({ message: "Marquee Zoom", context: "PDF viewer zoom" }) },
    menu: { descriptor: msg({ message: "Zoom Menu", context: "PDF viewer zoom" }) },
    level: {
      descriptor: msg({ message: "Zoom Level ({level}%)", context: "PDF viewer zoom" }),
      parameters: { level: "{level}" },
    },
    dragTip: {
      descriptor: msg({ message: "Drag to select area to zoom", context: "PDF viewer zoom" }),
    },
  },
  pan: {
    toggle: { descriptor: msg({ message: "Toggle Pan Mode", context: "PDF viewer pan" }) },
  },
  pointer: {
    toggle: { descriptor: msg({ message: "Toggle Pointer Mode", context: "PDF viewer pointer" }) },
  },
  document: {
    menu: { descriptor: msg({ message: "Document Menu", context: "PDF viewer document" }) },
    open: { descriptor: msg({ message: "Open", context: "PDF viewer document" }) },
    close: { descriptor: msg({ message: "Close", context: "PDF viewer document" }) },
    print: { descriptor: msg({ message: "Print", context: "PDF viewer document" }) },
    protect: { descriptor: msg({ message: "Security", context: "PDF viewer document" }) },
    export: { descriptor: msg({ message: "Export", context: "PDF viewer document" }) },
    fullscreen: { descriptor: msg({ message: "Fullscreen", context: "PDF viewer document" }) },
    loading: {
      descriptor: msg({ message: "Loading document...", context: "PDF viewer document" }),
    },
  },
  emptyState: {
    title: { descriptor: msg({ message: "No Documents Open", context: "PDF viewer emptyState" }) },
    description: {
      descriptor: msg({
        message: "Open a PDF document to get started.",
        context: "PDF viewer emptyState",
      }),
    },
    descriptionMulti: {
      descriptor: msg({
        message: "You can view multiple documents using tabs.",
        context: "PDF viewer emptyState",
      }),
    },
    openButton: { descriptor: msg({ message: "Open Document", context: "PDF viewer emptyState" }) },
    supportedFormats: {
      descriptor: msg({ message: "Supported format: PDF", context: "PDF viewer emptyState" }),
    },
  },
  passwordPrompt: {
    title: {
      descriptor: msg({ message: "Password Required", context: "PDF viewer passwordPrompt" }),
    },
    required: {
      descriptor: msg({
        message: "This document is password protected. Please enter the password to open it.",
        context: "PDF viewer passwordPrompt",
      }),
    },
    incorrect: {
      descriptor: msg({
        message: "The password you entered was incorrect. Please try again.",
        context: "PDF viewer passwordPrompt",
      }),
    },
    incorrectWarning: {
      descriptor: msg({
        message: "Incorrect password. Please check and try again.",
        context: "PDF viewer passwordPrompt",
      }),
    },
    label: { descriptor: msg({ message: "Password", context: "PDF viewer passwordPrompt" }) },
    placeholder: {
      descriptor: msg({ message: "Enter document password", context: "PDF viewer passwordPrompt" }),
    },
    open: { descriptor: msg({ message: "Open", context: "PDF viewer passwordPrompt" }) },
    opening: { descriptor: msg({ message: "Opening...", context: "PDF viewer passwordPrompt" }) },
    cancel: { descriptor: msg({ message: "Cancel", context: "PDF viewer passwordPrompt" }) },
    close: { descriptor: msg({ message: "Close", context: "PDF viewer passwordPrompt" }) },
  },
  documentError: {
    title: {
      descriptor: msg({ message: "Error loading document", context: "PDF viewer documentError" }),
    },
    unknown: {
      descriptor: msg({
        message: "An unknown error occurred",
        context: "PDF viewer documentError",
      }),
    },
    errorCode: {
      descriptor: msg({ message: "Error Code: {code}", context: "PDF viewer documentError" }),
      parameters: { code: "{code}" },
    },
    close: { descriptor: msg({ message: "Close Document", context: "PDF viewer documentError" }) },
  },
  panel: {
    sidebar: { descriptor: msg({ message: "Sidebar", context: "PDF viewer panel" }) },
    search: { descriptor: msg({ message: "Search", context: "PDF viewer panel" }) },
    comment: { descriptor: msg({ message: "Comment", context: "PDF viewer panel" }) },
    thumbnails: { descriptor: msg({ message: "Thumbnails", context: "PDF viewer panel" }) },
    outline: { descriptor: msg({ message: "Outline", context: "PDF viewer panel" }) },
    annotationStyle: {
      descriptor: msg({ message: "Annotation Style", context: "PDF viewer panel" }),
    },
    redaction: { descriptor: msg({ message: "Redaction Sidebar", context: "PDF viewer panel" }) },
  },
  menu: {
    viewControls: { descriptor: msg({ message: "View Controls", context: "PDF viewer menu" }) },
    zoomControls: { descriptor: msg({ message: "Zoom Controls", context: "PDF viewer menu" }) },
    moreOptions: { descriptor: msg({ message: "More Options", context: "PDF viewer menu" }) },
  },
  outline: {
    title: { descriptor: msg({ message: "Outline", context: "PDF viewer outline" }) },
    loading: { descriptor: msg({ message: "Loading outline...", context: "PDF viewer outline" }) },
    noOutline: {
      descriptor: msg({ message: "No outline available", context: "PDF viewer outline" }),
    },
    noBookmarks: {
      descriptor: msg({
        message: "This document doesn't contain bookmarks",
        context: "PDF viewer outline",
      }),
    },
  },
  page: {
    settings: { descriptor: msg({ message: "Page Settings", context: "PDF viewer page" }) },
    single: { descriptor: msg({ message: "Single Page", context: "PDF viewer page" }) },
    twoOdd: { descriptor: msg({ message: "Two Page (Odd)", context: "PDF viewer page" }) },
    twoEven: { descriptor: msg({ message: "Two Page (Even)", context: "PDF viewer page" }) },
    vertical: { descriptor: msg({ message: "Vertical", context: "PDF viewer page" }) },
    horizontal: { descriptor: msg({ message: "Horizontal", context: "PDF viewer page" }) },
    spreadMode: { descriptor: msg({ message: "Spread Mode", context: "PDF viewer page" }) },
    scrollLayout: { descriptor: msg({ message: "Scroll Layout", context: "PDF viewer page" }) },
    rotation: { descriptor: msg({ message: "Page Rotation", context: "PDF viewer page" }) },
    next: { descriptor: msg({ message: "Next Page", context: "PDF viewer page" }) },
    previous: { descriptor: msg({ message: "Previous Page", context: "PDF viewer page" }) },
  },
  rotate: {
    clockwise: { descriptor: msg({ message: "Rotate Clockwise", context: "PDF viewer rotate" }) },
    counterClockwise: {
      descriptor: msg({ message: "Rotate Counter-Clockwise", context: "PDF viewer rotate" }),
    },
  },
  selection: {
    copy: { descriptor: msg({ message: "Copy Selection", context: "PDF viewer selection" }) },
  },
  print: {
    title: { descriptor: msg({ message: "Print Settings", context: "PDF viewer print" }) },
    loading: { descriptor: msg({ message: "Preparing document...", context: "PDF viewer print" }) },
    pages: { descriptor: msg({ message: "Pages to print", context: "PDF viewer print" }) },
    all: { descriptor: msg({ message: "All pages", context: "PDF viewer print" }) },
    current: {
      descriptor: msg({ message: "Current page ({currentPage})", context: "PDF viewer print" }),
      parameters: { currentPage: "{currentPage}" },
    },
    specify: { descriptor: msg({ message: "Specify pages", context: "PDF viewer print" }) },
    specifyEG: { descriptor: msg({ message: "e.g., 1-3, 5, 8-10", context: "PDF viewer print" }) },
    total: {
      descriptor: msg({
        message: "Total pages in document: {totalPages}",
        context: "PDF viewer print",
      }),
      parameters: { totalPages: "{totalPages}" },
    },
    annotation: {
      descriptor: msg({ message: "Include annotations", context: "PDF viewer print" }),
    },
    printing: { descriptor: msg({ message: "Printing...", context: "PDF viewer print" }) },
    print: { descriptor: msg({ message: "Print", context: "PDF viewer print" }) },
    cancel: { descriptor: msg({ message: "Cancel", context: "PDF viewer print" }) },
  },
  common: {
    close: { descriptor: msg({ message: "Close", context: "PDF viewer common" }) },
    back: { descriptor: msg({ message: "Back", context: "PDF viewer common" }) },
    cancel: { descriptor: msg({ message: "Cancel", context: "PDF viewer common" }) },
  },
};

function isPhrase(value: Phrase | PhraseDictionary): value is Phrase {
  return "descriptor" in value;
}
function translatePhrases(dictionary: PhraseDictionary): Locale["translations"] {
  return Object.fromEntries(
    Object.entries(dictionary).map(([key, value]) => [
      key,
      isPhrase(value) ? i18n._(value.descriptor, value.parameters) : translatePhrases(value),
    ]),
  );
}

/** Reader owns all enabled PDF chrome, including locales not supplied by EmbedPDF.
 * Leave viewer parameter tokens intact; its document-scoped resolvers replace them.
 */
export function readerPdfLocale(): Locale {
  return { code: i18n.locale || "en", name: "Reader", translations: translatePhrases(phrases) };
}
