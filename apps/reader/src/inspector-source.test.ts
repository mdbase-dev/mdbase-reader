import { describe, expect, it } from "vitest";

import { inspectorSourceForTab } from "./inspector-source.js";
import { createLibraryWorkspaceTab, createWorkspaceTab } from "./source-workspace-layout.js";

import type { SourceSummary } from "@mdbase-reader/core";

const source = { id: "source-1" } as SourceSummary;
const otherSource = { id: "source-2" } as SourceSummary;

describe("inspector source context", () => {
  it("keeps the selected source when a library tab receives focus", () => {
    expect(inspectorSourceForTab(createLibraryWorkspaceTab(), null, source)).toBe(source);
  });

  it("does not expose stale source tools while a source selection is changing", () => {
    expect(inspectorSourceForTab(createWorkspaceTab(source.id), source, otherSource)).toBeNull();
  });

  it("uses the active source after source-tab selection settles", () => {
    expect(inspectorSourceForTab(createWorkspaceTab(source.id), source, source)).toBe(source);
  });
});
