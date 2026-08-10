import type { SourceId } from "@mdbase-reader/core";

export type WorkspacePaneId = "primary" | `pane-${number}`;

export interface SourceWorkspacePane {
  readonly id: WorkspacePaneId;
  readonly sourceIds: readonly SourceId[];
  readonly activeSourceId: SourceId | null;
}

export interface SourceWorkspaceLayout {
  readonly panes: readonly SourceWorkspacePane[];
  readonly focusedPaneId: WorkspacePaneId;
}

export function createSourceWorkspaceLayout(sourceId: SourceId | null): SourceWorkspaceLayout {
  return {
    panes: [pane("primary", sourceId)],
    focusedPaneId: "primary",
  };
}

export function focusedPane(layout: SourceWorkspaceLayout): SourceWorkspacePane {
  return (
    layout.panes.find(({ id }) => id === layout.focusedPaneId) ??
    layout.panes[0] ??
    pane("primary", null)
  );
}

export function openSource(
  layout: SourceWorkspaceLayout,
  sourceId: SourceId,
  paneId: WorkspacePaneId = layout.focusedPaneId,
): SourceWorkspaceLayout {
  return updatePane(layout, paneId, (current) => ({
    ...current,
    sourceIds: current.sourceIds.includes(sourceId)
      ? current.sourceIds
      : [...current.sourceIds, sourceId],
    activeSourceId: sourceId,
  }));
}

export function activateSource(
  layout: SourceWorkspaceLayout,
  sourceId: SourceId,
  paneId: WorkspacePaneId = layout.focusedPaneId,
): SourceWorkspaceLayout {
  const target = layout.panes.find(({ id }) => id === paneId);
  return target?.sourceIds.includes(sourceId) ? openSource(layout, sourceId, paneId) : layout;
}

export function closeSource(
  layout: SourceWorkspaceLayout,
  sourceId: SourceId,
  paneId: WorkspacePaneId = layout.focusedPaneId,
): SourceWorkspaceLayout {
  return updatePane(layout, paneId, (current) => {
    const closingIndex = current.sourceIds.indexOf(sourceId);
    if (closingIndex < 0) {
      return current;
    }
    const sourceIds = current.sourceIds.filter((id) => id !== sourceId);
    const nextIndex = Math.min(closingIndex, sourceIds.length - 1);
    return {
      ...current,
      sourceIds,
      activeSourceId:
        current.activeSourceId === sourceId
          ? (sourceIds[nextIndex] ?? null)
          : current.activeSourceId,
    };
  });
}

export function splitPane(
  layout: SourceWorkspaceLayout,
  sourceId: SourceId | null,
): SourceWorkspaceLayout {
  const id = nextPaneId(layout.panes);
  return {
    panes: [...layout.panes, pane(id, sourceId)],
    focusedPaneId: id,
  };
}

export function focusPane(
  layout: SourceWorkspaceLayout,
  paneId: WorkspacePaneId,
): SourceWorkspaceLayout {
  return layout.panes.some(({ id }) => id === paneId)
    ? { ...layout, focusedPaneId: paneId }
    : layout;
}

function pane(id: WorkspacePaneId, sourceId: SourceId | null): SourceWorkspacePane {
  return {
    id,
    sourceIds: sourceId ? [sourceId] : [],
    activeSourceId: sourceId,
  };
}

function updatePane(
  layout: SourceWorkspaceLayout,
  paneId: WorkspacePaneId,
  update: (pane: SourceWorkspacePane) => SourceWorkspacePane,
): SourceWorkspaceLayout {
  if (!layout.panes.some(({ id }) => id === paneId)) {
    return layout;
  }
  return {
    panes: layout.panes.map((current) => (current.id === paneId ? update(current) : current)),
    focusedPaneId: paneId,
  };
}

function nextPaneId(panes: readonly SourceWorkspacePane[]): WorkspacePaneId {
  let suffix = 2;
  while (panes.some(({ id }) => id === `pane-${suffix}`)) {
    suffix += 1;
  }
  return `pane-${suffix}`;
}
