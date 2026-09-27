import { describe, expect, it, vi } from "vitest";

import { createTextSelectionTool } from "./embedpdf-text-selection-tool.js";

import type { InteractionManagerPlugin } from "@embedpdf/react-pdf-viewer";

type Interaction = ReturnType<InteractionManagerPlugin["provides"]>;

function fakes(): {
  readonly interaction: Interaction;
  readonly selection: Parameters<typeof createTextSelectionTool>[1];
  readonly endSelection: () => void;
  readonly changeSelection: (selection: unknown) => void;
  readonly activeMode: () => string;
} {
  let mode = "panMode";
  const modeListeners = new Set<(event: { activeMode: string }) => void>();
  const endListeners = new Set<() => void>();
  const changeListeners = new Set<(event: { selection: unknown }) => void>();
  const setMode = (next: string): void => {
    mode = next;
    modeListeners.forEach((listener) => listener({ activeMode: next }));
  };
  const interaction = {
    getActiveMode: () => mode,
    activate: (id: string) => setMode(id),
    activateDefaultMode: () => setMode("panMode"),
    onModeChange: (listener: (event: { activeMode: string }) => void) => {
      modeListeners.add(listener);
      return () => modeListeners.delete(listener);
    },
  } as unknown as Interaction;
  return {
    interaction,
    selection: {
      onEndSelection: (listener) => {
        endListeners.add(listener);
        return () => endListeners.delete(listener);
      },
      onSelectionChange: (listener) => {
        changeListeners.add(listener);
        return () => changeListeners.delete(listener);
      },
    },
    endSelection: () => endListeners.forEach((listener) => listener()),
    changeSelection: (selection) => changeListeners.forEach((listener) => listener({ selection })),
    activeMode: () => mode,
  };
}

describe("createTextSelectionTool", () => {
  it("turns selecting on and off, reporting each change", () => {
    const { interaction, selection, activeMode } = fakes();
    const { tool } = createTextSelectionTool(interaction, selection);
    const changes = vi.fn();
    tool.changes.subscribe(changes);
    expect(tool.isActive()).toBe(false);
    tool.begin();
    expect(activeMode()).toBe("pointerMode");
    expect(tool.isActive()).toBe(true);
    tool.cancel();
    expect(activeMode()).toBe("panMode");
    expect(changes.mock.calls).toEqual([[true], [false]]);
  });

  it("returns to panning once the selection it made is dismissed", () => {
    const { interaction, selection, endSelection, changeSelection, activeMode } = fakes();
    const { tool } = createTextSelectionTool(interaction, selection);
    tool.begin();
    // Clearing before anything is selected (the drag's own start) keeps the tool on.
    changeSelection(null);
    expect(activeMode()).toBe("pointerMode");
    endSelection();
    changeSelection({ pages: [] });
    expect(activeMode()).toBe("pointerMode");
    changeSelection(null);
    expect(activeMode()).toBe("panMode");
    expect(tool.isActive()).toBe(false);
  });

  it("stops following EmbedPDF when stopped", () => {
    const { interaction, selection } = fakes();
    const { tool, stop } = createTextSelectionTool(interaction, selection);
    const changes = vi.fn();
    tool.changes.subscribe(changes);
    stop();
    interaction.activate("pointerMode");
    expect(changes).not.toHaveBeenCalled();
  });
});
