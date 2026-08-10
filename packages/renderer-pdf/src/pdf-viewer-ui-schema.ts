import type { UISchema } from "@embedpdf/react-pdf-viewer";

/**
 * Reader owns durable highlights and captures. Disabling these categories at
 * the viewer boundary also blocks commands that are absent from the toolbar.
 */
export const readerPdfDisabledCategories = [
  "annotation",
  "attachment",
  "document",
  "form",
  "history",
  "insert",
  "mode",
  "redaction",
  "security",
  "signature",
  "stamp",
] as const;

const zoomMenuItems = [50, 100, 125, 150, 200].map((level) => {
  const value = String(level);
  return {
    type: "command" as const,
    id: `reader-zoom-${value}`,
    commandId: `zoom:${value}`,
    categories: ["zoom", "zoom-level", `zoom-level-${value}`],
  };
});

/** A deliberately small, reading-only EmbedPDF surface. */
export const readerPdfUiSchema = {
  id: "mdbase-reader-pdf-ui",
  version: "1.0.0",
  toolbars: {
    "main-toolbar": {
      id: "main-toolbar",
      position: { placement: "top", slot: "main", order: 0 },
      permanent: true,
      responsive: {
        breakpoints: {
          compact: {
            maxWidth: 479,
            hide: ["reader-interaction-divider", "reader-pan", "reader-pointer"],
          },
          narrow: { maxWidth: 319, hide: ["reader-zoom"] },
          readingPane: {
            minWidth: 320,
            show: ["reader-zoom"],
          },
          fullControls: {
            minWidth: 480,
            show: ["reader-interaction-divider", "reader-pan", "reader-pointer"],
          },
        },
      },
      items: [
        {
          type: "group",
          id: "reader-navigation",
          alignment: "start",
          gap: 2,
          items: [
            {
              type: "command-button",
              id: "reader-sidebar",
              commandId: "panel:toggle-sidebar",
              variant: "icon",
              categories: ["panel", "panel-sidebar"],
            },
          ],
        },
        {
          type: "custom",
          id: "reader-zoom",
          componentId: "zoom-toolbar",
          categories: ["zoom"],
        },
        {
          type: "divider",
          id: "reader-interaction-divider",
          orientation: "vertical",
        },
        {
          type: "command-button",
          id: "reader-pan",
          commandId: "pan:toggle",
          variant: "icon",
          categories: ["tools", "pan"],
        },
        {
          type: "command-button",
          id: "reader-pointer",
          commandId: "pointer:toggle",
          variant: "icon",
          categories: ["tools", "pointer"],
        },
        { type: "spacer", id: "reader-toolbar-spacer", flex: true },
        {
          type: "command-button",
          id: "reader-search",
          commandId: "panel:toggle-search",
          variant: "icon",
          categories: ["panel", "panel-search", "search"],
        },
      ],
    },
  },
  menus: {
    "zoom-menu": {
      id: "zoom-menu",
      categories: ["zoom"],
      items: [
        {
          type: "command",
          id: "reader-fit-width",
          commandId: "zoom:fit-width",
          categories: ["zoom", "zoom-fit-width"],
        },
        {
          type: "command",
          id: "reader-fit-page",
          commandId: "zoom:fit-page",
          categories: ["zoom", "zoom-fit-page"],
        },
        { type: "divider", id: "reader-zoom-divider" },
        ...zoomMenuItems,
      ],
    },
  },
  sidebars: {
    "sidebar-panel": {
      id: "sidebar-panel",
      position: { placement: "left", slot: "main", order: 0 },
      content: {
        type: "tabs",
        defaultTab: "thumbnails",
        tabs: [
          {
            id: "thumbnails",
            labelKey: "panel.thumbnails",
            label: "Thumbnails",
            icon: "squares",
            componentId: "thumbnails-sidebar",
          },
          {
            id: "outline",
            labelKey: "panel.outline",
            label: "Outline",
            icon: "listTree",
            componentId: "outline-sidebar",
          },
        ],
      },
      width: "250px",
      collapsible: true,
      defaultOpen: false,
    },
    "search-panel": {
      id: "search-panel",
      position: { placement: "right", slot: "main", order: 0 },
      content: { type: "component", componentId: "search-sidebar" },
      width: "280px",
      collapsible: true,
      defaultOpen: false,
    },
  },
  modals: {},
  overlays: {
    "page-controls": {
      id: "page-controls",
      position: { anchor: "bottom-center", offset: { bottom: "1.25rem" } },
      content: { type: "component", componentId: "page-controls" },
      defaultEnabled: true,
    },
  },
  selectionMenus: {
    selection: {
      id: "selection",
      items: [
        {
          type: "command-button",
          id: "reader-copy-selection",
          commandId: "selection:copy",
          variant: "icon",
          categories: ["selection", "selection-copy"],
        },
      ],
    },
  },
} satisfies UISchema;
