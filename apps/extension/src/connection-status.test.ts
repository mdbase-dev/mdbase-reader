import { expect, it } from "vitest";

import { connectionUnavailableMessage } from "./connection-status.js";

import type { ReaderConnectSnapshot } from "@mdbase-reader/connect";

it.each([
  ["unavailable", "temporarily unavailable"],
  ["authorization_required", "Approve access"],
  ["setup_review_required", "Review and apply"],
  ["starting", "getting ready"],
  ["unselected", "Choose a collection"],
])("explains %s without calling an existing collection unconnected", (status, expected) => {
  const snapshot = {
    status,
    collectionId: "c",
    connections: [{ collectionId: "c", displayName: "Local" }],
  } as unknown as ReaderConnectSnapshot;
  expect(connectionUnavailableMessage(snapshot)).toContain(expected);
  expect(connectionUnavailableMessage(snapshot)).not.toContain(
    "Connect a collection before saving",
  );
});

it("preserves the actionable blocked reason", () => {
  const snapshot = {
    status: "blocked",
    problem: { message: "Collection requires an update" },
  } as ReaderConnectSnapshot;
  expect(connectionUnavailableMessage(snapshot)).toBe("Collection requires an update");
});
