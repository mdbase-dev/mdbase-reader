import { shortcutLabel } from "@mdbase-dev/ui/command-palette";
import { readerI18n } from "@mdbase-reader/i18n";
import { describe, expect, it, vi } from "vitest";

import { ReaderHeader } from "./ReaderHeader.js";
import { renderToStaticMarkup } from "./testing/i18n.js";

import type { ReaderDirectAccessState } from "./use-direct-access.js";

const actions = {
  onChangeTheme: () => undefined,
  onOpenCommands: () => undefined,
  onToggleLibrary: () => undefined,
  onToggleInspector: () => undefined,
};

function renderHeader(directAccess: ReaderDirectAccessState): string {
  return renderToStaticMarkup(
    <ReaderHeader
      collectionName="Local library"
      connectionState="connected"
      directAccess={directAccess}
      theme="system"
      libraryOpen
      inspectorOpen={false}
      inspectorAvailable
      {...actions}
    />,
  );
}

describe("ReaderHeader direct access", () => {
  it("uses one coherent control treatment for both pane toggles", () => {
    const markup = renderHeader({
      snapshot: null,
      working: false,
      problem: null,
      request: vi.fn(),
    });

    expect(markup.match(/header-pane-toggle/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="Toggle Sources sidebar"');
    expect(markup).toContain('aria-label="Toggle Notes panel"');
    expect(markup).not.toContain('aria-controls="reader-library-navigator"');
    expect(markup).not.toContain('aria-controls="reader-source-tools"');
    expect(markup).toContain('class="icon-button header-pane-toggle is-library"');
    expect(markup).toContain('class="icon-button header-pane-toggle is-inspector"');
  });

  it("offers a user-initiated local network request for a relayed connector", () => {
    const request = vi.fn();
    const markup = renderHeader({
      snapshot: { authority: "connector", route: "relay", status: "permission_required" },
      working: false,
      problem: null,
      request,
    });

    expect(markup).toContain(">Connect directly</button>");
    expect(markup).toContain("Request local network access");
  });

  it("names the direct-connect button by its words and describes it with the explanation", () => {
    const problem = "Local network access failed: NotAllowedError";
    const markup = renderHeader({
      snapshot: { authority: "connector", route: "relay", status: "denied" },
      working: false,
      problem,
      request: vi.fn(),
    });
    const button = /<button[^>]*connection-direct-action[^>]*>/u.exec(markup)?.[0] ?? "";

    expect(button).not.toContain("aria-label");
    expect(button).toContain(`title="${problem}"`);
    const describedBy = /aria-describedby="([^"]+)"/u.exec(button)?.[1] ?? "";
    expect(describedBy).toBeTruthy();
    expect(markup).toContain(`<span id="${describedBy}" class="sr-only">${problem}</span>`);
    expect(markup).toContain(">Retry local access</button>");
  });
});

describe("ReaderHeader reading mode", () => {
  function renderReadingMode(available: boolean, readingMode = false): string {
    return renderToStaticMarkup(
      <ReaderHeader
        collectionName="Local library"
        connectionState="connected"
        directAccess={{ snapshot: null, working: false, problem: null, request: vi.fn() }}
        theme="system"
        libraryOpen
        inspectorOpen={false}
        inspectorAvailable
        readingModeAvailable={available}
        readingMode={readingMode}
        onToggleReadingMode={vi.fn()}
        {...actions}
      />,
    );
  }

  it("stays focusable and explains itself when no document is open", () => {
    const markup = renderReadingMode(false);
    const button = /<button[^>]*header-reading-mode[^>]*>/u.exec(markup)?.[0] ?? "";

    expect(button).not.toMatch(/\sdisabled=""/u);
    expect(button).toContain('aria-disabled="true"');
    const describedBy = /aria-describedby="([^"]+)"/u.exec(button)?.[1] ?? "";
    expect(markup).toContain(
      `<span id="${describedBy}" class="sr-only">Open a document to maximize it</span>`,
    );
  });

  it("is an ordinary toggle when a document is open", () => {
    const button =
      /<button[^>]*header-reading-mode[^>]*>/u.exec(renderReadingMode(true))?.[0] ?? "";

    expect(button).not.toContain("aria-disabled");
    expect(button).not.toContain("aria-describedby");
  });

  it.each([
    ["de", "Dokument maximieren", "Dokumentbereiche wiederherstellen"],
    ["es", "Maximizar documento", "Restaurar los paneles del documento"],
    ["fr", "Agrandir le document", "Rétablir les volets du document"],
    ["it", "Ingrandisci documento", "Ripristina i riquadri del documento"],
    ["ja", "文書を最大化", "文書ペインを元に戻す"],
    ["ko", "문서 최대화", "문서 창 복원"],
    ["pt", "Maximizar documento", "Restaurar os painéis do documento"],
    ["ru", "Развернуть документ", "Восстановить панели документа"],
    ["zh", "最大化文档", "恢复文档窗格"],
  ] as const)(
    "translates both complete reading-mode tooltips in %s",
    async (locale, enter, leave) => {
      try {
        await readerI18n.selectLocale(locale);
        for (const active of [false, true]) {
          const button =
            /<button[^>]*header-reading-mode[^>]*>/u.exec(renderReadingMode(true, active))?.[0] ??
            "";
          expect(button).toContain(`title="${active ? leave : enter} · ${shortcutLabel("mod+.")}"`);
          expect(button).toContain(`aria-pressed="${String(active)}"`);
        }
      } finally {
        await readerI18n.selectLocale("en");
      }
    },
  );

  it("reports an active direct connection without retaining the action", () => {
    const markup = renderHeader({
      snapshot: { authority: "connector", route: "direct", status: "available" },
      working: false,
      problem: null,
      request: vi.fn(),
    });

    expect(markup).toContain("Direct connection</span>");
    expect(markup).not.toContain("Connect directly");
  });
});
