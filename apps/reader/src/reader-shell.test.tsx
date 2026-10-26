import { matchingCommands, shortcutLabel } from "@mdbase-dev/ui/command-palette";
import {
  collectionId,
  fileId,
  fileRevision,
  sourceId,
  type SourceSummary,
} from "@mdbase-reader/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DisplaySettings } from "./DisplaySettings.js";
import {
  readerCommands,
  type ReaderCommand,
  type ReaderCommandInput,
} from "./reader-command-list.js";
import { ReaderHeader } from "./ReaderHeader.js";
import { renderToStaticMarkup } from "./testing/i18n.js";

const source = (id: string, overrides: Partial<SourceSummary> = {}): SourceSummary => ({
  collectionId: collectionId("c"),
  id: sourceId(id),
  path: `sources/${id}.md`,
  title: `Title ${id}`,
  creators: [],
  tags: [],
  documents: [
    {
      fileId: fileId(`file_${id}`),
      file: `[[files/${id}.pdf]]`,
      revision: fileRevision(`sha256:${"0".repeat(64)}`),
      mediaType: "application/pdf",
      role: "primary",
    },
  ],
  ...overrides,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shortcut labels", () => {
  it("uses Apple glyphs on macOS and spelled-out modifiers elsewhere", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)" });
    expect(shortcutLabel("mod+shift+f")).toBe("⌘⇧F");
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (X11; Linux x86_64)" });
    expect(shortcutLabel("mod+shift+f")).toBe("Ctrl+Shift+F");
    expect(shortcutLabel("mod+k")).toBe("Ctrl+K");
  });
});

describe("command palette", () => {
  const command = (id: string, group: ReaderCommand["group"]): ReaderCommand => ({
    id,
    label: id,
    group,
    run: () => undefined,
  });

  it("browses a few commands from every group without a query", () => {
    const commands = [
      ...Array.from({ length: 20 }, (_, index) => command(`source ${String(index)}`, "Sources")),
      command("Open library", "Library"),
      command("Use dark theme", "Display"),
    ];
    const browse = matchingCommands(commands, "");
    expect(browse.filter(({ group }) => group === "Sources")).toHaveLength(6);
    expect(browse.map(({ id }) => id)).toContain("Use dark theme");
  });

  it("keeps matching commands together by group", () => {
    const commands = [
      command("dark source", "Sources"),
      command("Open library", "Library"),
      command("Use dark theme", "Display"),
      command("another dark source", "Sources"),
    ];
    expect(matchingCommands(commands, "dark").map(({ id }) => id)).toEqual([
      "dark source",
      "another dark source",
      "Use dark theme",
    ]);
  });

  it("lists an open source once, as an open tab, and offers only the other themes", () => {
    const open = source("open");
    const closed = source("closed");
    const tab = { kind: "source", id: "open::document", sourceId: open.id, view: "document" };
    const input = {
      sources: [open, closed],
      activeSource: null,
      workspace: {
        layout: { panes: [{ id: "primary", tabs: [tab] }], focusedPaneId: "primary" },
        activeTab: null,
        openSourceIds: [open.id],
      },
      sourceExport: { run: () => undefined },
      bibliographyExport: { run: () => undefined },
      focusMode: false,
      toggleFocus: () => undefined,
      toggleLibrary: () => undefined,
      toggleInspector: () => undefined,
      searchLibrary: () => undefined,
      addSource: () => undefined,
      importHref: "/import",
      theme: "dark",
      setTheme: () => undefined,
      density: "comfortable",
      setDensity: () => undefined,
    } as unknown as ReaderCommandInput;
    const commands = readerCommands(input);
    const titled = (title: string): readonly string[] =>
      commands.filter(({ label }) => label === title).map(({ group }) => group);
    expect(titled(open.title)).toEqual(["Open tabs"]);
    expect(titled(closed.title)).toEqual(["Sources"]);
    const themes = commands.filter(({ id }) => id.startsWith("theme:")).map(({ id }) => id);
    expect(themes).toEqual(["theme:system", "theme:light"]);
    const active = readerCommands({ ...input, activeSource: open });
    expect(active.find(({ id }) => id === "note")?.label).toBe("Open source note");
    expect(active.find(({ id }) => id === "citation")?.label).toBe("Open citation details");
    expect(active.find(({ id }) => id === "split-right")?.label).toBe("Open beside");
    expect(active.find(({ id }) => id === "split-below")?.label).toBe("Open below");
    for (const [query, id] of [
      ["literature note", "note"],
      ["owner", "annotations"],
      ["citekey", "citation"],
      ["field sources", "citation"],
      ["duplicate", "split-right"],
      ["duplicate", "split-below"],
      ["left sidebar", "toggle-library"],
      ["right sidebar", "toggle-source-tools"],
    ]) {
      expect(matchingCommands(active, query!).map((command) => command.id)).toContain(id);
    }
  });
});

describe("header", () => {
  const render = (connectionState: "connected" | "offline"): string =>
    renderToStaticMarkup(
      <ReaderHeader
        collectionName="Reading"
        connectionState={connectionState}
        directAccess={{ snapshot: null, working: false, problem: null, request: vi.fn() }}
        theme="light"
        onChangeTheme={() => undefined}
        onChangeDensity={() => undefined}
        onOpenCommands={() => undefined}
        onToggleLibrary={() => undefined}
        onToggleInspector={() => undefined}
        libraryOpen
        inspectorOpen={false}
        inspectorAvailable
      />,
    );

  it("keeps the normal connected state quiet but announces problems", () => {
    expect(render("connected")).toContain('<span class="sr-only">Connected</span>');
    expect(render("offline")).toContain("<span>Offline</span>");
  });

  it("keeps the settings trigger immediate without rendering unopened settings", () => {
    const markup = render("connected");
    expect(markup).toContain('aria-label="Display settings"');
    expect(markup).not.toContain(">Light</button>");
    expect(markup).not.toContain(">Comfortable</button>");
  });

  it("loaded settings offer explicit theme and density choices with the current one pressed", () => {
    const markup = renderToStaticMarkup(
      <DisplaySettings
        theme="light"
        onChangeTheme={vi.fn()}
        density="comfortable"
        onChangeDensity={vi.fn()}
        sidebarWhileReading="hide"
      />,
    );
    expect(markup).toContain('aria-pressed="true">Light</button>');
    expect(markup).toContain('aria-pressed="true">Comfortable</button>');
  });
});
