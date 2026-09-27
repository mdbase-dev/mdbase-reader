import { createEventEmitter } from "@mdbase-reader/reading-surface";

import type { InteractionManagerPlugin } from "@embedpdf/react-pdf-viewer";
import type { TextSelectionTool, Unsubscribe } from "@mdbase-reader/reading-surface";

type InteractionCapability = ReturnType<InteractionManagerPlugin["provides"]>;

/** The parts of EmbedPDF's selection capability the tool follows. */
export interface SelectionEvents {
  onEndSelection(listener: () => void): Unsubscribe;
  onSelectionChange(listener: (event: { readonly selection: unknown }) => void): Unsubscribe;
}

/** EmbedPDF's text-selecting interaction mode; its pan mode is the default on touch devices. */
const selectingMode = "pointerMode";

/**
 * On a touch device a PDF pans by default, since selecting mode takes every finger drag and
 * nothing would scroll. The tool switches to selecting until the selection it made is dismissed
 * (highlighted, commented on, or tapped away), then returns to panning.
 */
export function createTextSelectionTool(
  interaction: InteractionCapability,
  selection: SelectionEvents,
): { readonly tool: TextSelectionTool; readonly stop: () => void } {
  const changes = createEventEmitter<boolean>();
  let active = interaction.getActiveMode() === selectingMode;
  let selected = false;
  const stops = [
    interaction.onModeChange((event) => {
      const next = event.activeMode === selectingMode;
      if (next !== active) {
        active = next;
        selected = false;
        changes.emit(next);
      }
    }),
    selection.onEndSelection(() => {
      selected = active;
    }),
    selection.onSelectionChange((event) => {
      if (event.selection === null && active && selected) {
        selected = false;
        interaction.activateDefaultMode();
      }
    }),
  ];
  return {
    tool: {
      changes,
      isActive: () => active,
      begin: () => interaction.activate(selectingMode),
      cancel: () => interaction.activateDefaultMode(),
    },
    stop: () => {
      stops.forEach((stop) => stop());
      changes.clear();
    },
  };
}
