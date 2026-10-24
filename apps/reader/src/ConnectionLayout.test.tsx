import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SelectedAuthorizationAction } from "./ConnectionLayout.js";

import type { ReaderConnectSnapshot } from "@mdbase-reader/connect";

function unavailable(reason: string): Exclude<ReaderConnectSnapshot, { status: "ready" }> {
  return {
    status: "unavailable",
    collectionId: "c1",
    reason,
    connections: [],
  } as unknown as Exclude<ReaderConnectSnapshot, { status: "ready" }>;
}

function action(reason: string): string {
  return renderToStaticMarkup(
    <SelectedAuthorizationAction
      session={unavailable(reason)}
      error={null}
      working={false}
      hasSelectedCollection
      onAuthorize={() => undefined}
    />,
  );
}

describe("SelectedAuthorizationAction", () => {
  it("offers the approval each unavailable reason needs", () => {
    expect(action("not_authorized")).toContain(">Authorize collection</button>");
    expect(action("authorization_lost")).toContain(">Reconnect collection</button>");
    expect(action("invalid_stored_grant")).toContain(">Reconnect collection</button>");
    expect(action("legacy_scope_reauthorization_required")).toContain(
      ">Review updated access</button>",
    );
    expect(action("some_future_reason")).toContain(">Reconnect collection</button>");
  });
});
