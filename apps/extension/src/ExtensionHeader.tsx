import { MdbaseMark } from "@mdbase-reader/ui";

import { readerLibraryUrl } from "./capture-model.js";
import { environment } from "./environment.js";

/** The product brand, linking to the Reader library (on the selected collection, if any). */
export function ExtensionHeader({
  collectionId,
}: {
  readonly collectionId?: string | null;
}): React.JSX.Element {
  return (
    <header className="extension-header">
      <a
        className="brand"
        href={readerLibraryUrl(collectionId)}
        target="_blank"
        rel="noreferrer"
        title="Open your library in mdbase Reader"
      >
        <MdbaseMark className="mark" />
        <strong>mdbase</strong>
        <span>reader</span>
      </a>
      {environment.label ? <span className="environment">{environment.label}</span> : null}
    </header>
  );
}
