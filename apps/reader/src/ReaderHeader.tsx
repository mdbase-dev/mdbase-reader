import { ProductBrand, type ThemePreference } from "@mdbase-reader/ui";

import { ThemeIcon } from "./icons.js";

import type { JSX } from "react";

interface ReaderHeaderProps {
  readonly collectionName: string;
  readonly connectionState: "connected" | "offline" | "syncing";
  readonly theme: ThemePreference;
  readonly onChangeTheme: () => void;
}

export function ReaderHeader({
  collectionName,
  connectionState,
  theme,
  onChangeTheme,
}: ReaderHeaderProps): JSX.Element {
  return (
    <header className="reader-header">
      <ProductBrand />
      <div className="reader-header-context">
        <span>{collectionName}</span>
        <i aria-hidden="true" />
        <span className={`connection-state is-${connectionState}`}>{connectionState}</span>
      </div>
      <div className="reader-header-actions">
        <button
          className="icon-button"
          type="button"
          aria-label={`Theme: ${theme}. Change theme`}
          onClick={onChangeTheme}
        >
          <ThemeIcon />
        </button>
        <button
          className="profile-button"
          type="button"
          aria-label="Account and collection settings"
        >
          CB
        </button>
      </div>
    </header>
  );
}
