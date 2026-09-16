import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ReaderHeader } from "./ReaderHeader.js";

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
