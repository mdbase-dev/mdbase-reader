import { sourceId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { sourcesForWorkspaceRestore } from "./workspace-restore-sources.js";

describe("restoration with a partial source index", () => {
  const loaded = sourceId("loaded");
  const restored = sourceId("restored-later-page");
  const serialized = JSON.stringify({
    layout: {
      panels: {
        source: {
          params: {
            tab: {
              kind: "source",
              sourceId: restored,
            },
          },
        },
      },
    },
  });
  it("keeps tabs whose source has not been indexed yet", () => {
    expect([...sourcesForWorkspaceRestore(new Set([loaded]), serialized, false)]).toEqual([
      loaded,
      restored,
    ]);
  });
  it("does not override a complete index's missing-source checks", () => {
    const known = new Set([loaded]);
    expect(sourcesForWorkspaceRestore(known, serialized, true)).toBe(known);
    expect(known.has(restored)).toBe(false);
  });
  it("does not infer source IDs from unrelated saved fields", () => {
    expect([
      ...sourcesForWorkspaceRestore(
        new Set(),
        JSON.stringify({ kind: "library", sourceId: "not-a-source" }),
        false,
      ),
    ]).toEqual([]);
  });
});
