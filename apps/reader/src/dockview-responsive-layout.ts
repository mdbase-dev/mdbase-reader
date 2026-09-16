import { desktopLayout, edgePositions, mobileLayout } from "./dockview-responsive-state.js";

import type { DockviewApi, SerializedDockview } from "dockview-react";

function desktopForMobile(
  previous: SerializedDockview | null,
  live: SerializedDockview,
  focused: string | null,
): SerializedDockview {
  const desktop = previous ? desktopLayout(previous, live, focused) : live;
  for (const position of edgePositions) {
    const edge = desktop.edgeGroups?.[position],
      visible = live.edgeGroups?.[position]?.visible;
    // A fresh phone session has no desktop geometry yet; do not save phone-clamped edge widths.
    if (edge && !previous) {
      edge.size = position === "left" ? 260 : 340;
    }
    if (edge && visible !== undefined) {
      edge.visible = visible;
    }
  }
  return desktop;
}
/** Native responsive layouts reuse the very same panels (including editors and iframes). */
export class ResponsiveDockLayout {
  private desktop: SerializedDockview | null = null;
  private lastDesktop: SerializedDockview | null = null;
  private pendingSizes: SerializedDockview["edgeGroups"];
  layoutViewport(api: DockviewApi | null, width: number, height: number): void {
    if (api) {
      api.layout(width, height);
      this.restoreSizes(api);
    }
  }
  private restoreSizes(api: DockviewApi): void {
    if (!this.pendingSizes) {
      return;
    }
    const sizes = this.pendingSizes;
    this.pendingSizes = undefined;
    for (const position of edgePositions) {
      const edge = sizes[position];
      if (edge) {
        api
          .getEdgeGroup(position)
          ?.setSize(
            position === "left" || position === "right"
              ? { width: edge.size }
              : { height: edge.size },
          );
      }
    }
    // Do not let a transient narrow fromJSON layout replace the desktop geometry cache.
    this.lastDesktop = api.toJSON();
  }
  seed(layout: SerializedDockview): void {
    this.lastDesktop = structuredClone(layout);
  }
  remember(api: DockviewApi): void {
    if (!this.mobile && !this.pendingSizes) {
      this.lastDesktop = api.toJSON();
    }
  }
  get mobile(): boolean {
    return this.desktop !== null;
  }
  setMobile(api: DockviewApi, value: boolean, focused: string | null): void {
    if (value === this.mobile) {
      return;
    }
    api.exitMaximizedGroup();
    if (value) {
      this.desktop = desktopForMobile(this.lastDesktop, api.toJSON(), focused);
      api.fromJSON(mobileLayout(this.desktop, focused), { reuseExistingPanels: true });
      // fromJSON retains configured shells. The panels have already moved, so remove empty edges.
      for (const position of edgePositions) {
        if (api.getEdgeGroup(position)) {
          api.removeEdgeGroup(position);
        }
      }
    } else if (this.desktop) {
      const restored = desktopLayout(this.desktop, api.toJSON(), focused);
      this.desktop = null;
      api.fromJSON(restored, { reuseExistingPanels: true });
      // Apply after React removes the mobile toolbar and the host has its desktop dimensions.
      this.pendingSizes = restored.edgeGroups;
    }
  }
  serialize(api: DockviewApi, focused: string | null): SerializedDockview {
    return this.desktop ? desktopLayout(this.desktop, api.toJSON(), focused) : api.toJSON();
  }
}
