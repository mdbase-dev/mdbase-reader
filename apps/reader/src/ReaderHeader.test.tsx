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
      inspectorOpen={false}
      {...actions}
    />,
  );
}

describe("ReaderHeader direct access", () => {
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

    expect(markup).toContain(">direct</span>");
    expect(markup).not.toContain("Connect directly");
  });
});
