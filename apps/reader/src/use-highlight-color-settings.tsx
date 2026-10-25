import { useEffect, useState, type JSX } from "react";

import { bindHighlightSettings } from "./highlight-colors.js";
import { lazyFeature } from "./lazy-feature.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";

const HighlightColorSettings = lazyFeature(
  async () => ({
    default: (await import("./HighlightColorSettings.js")).HighlightColorSettings,
  }),
  "highlight colour settings",
);

/**
 * The collection's highlight colours: followed live by every swatch, card and filter while the
 * workspace is open, and edited in a dialog opened from the display menu. The dialog is absent
 * when the collection has no settings record support.
 */
export function useHighlightColorSettings(gateway: ReaderWorkspaceGateway): {
  readonly open: (() => void) | undefined;
  readonly dialog: JSX.Element | null;
} {
  const [opened, setOpened] = useState(false);
  const settings = gateway.settings;
  useEffect(() => (settings ? bindHighlightSettings(settings) : undefined), [settings]);
  return {
    open: settings ? () => setOpened(true) : undefined,
    dialog:
      settings && opened ? (
        <HighlightColorSettings settings={settings} onClose={() => setOpened(false)} />
      ) : null,
  };
}
