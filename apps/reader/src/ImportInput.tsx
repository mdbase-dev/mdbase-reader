import { useState, type JSX } from "react";

import type { ImportController } from "./import-controller.js";
export function ImportInput({
  service,
  disabled,
  controller,
}: {
  service: "zotero" | "readwise";
  disabled: boolean;
  controller: ImportController;
}): JSX.Element {
  return (
    <section className="import-step" aria-labelledby="import-input-title">
      <h2 id="import-input-title">Choose what to bring</h2>
      {service === "zotero" ? (
        <ZoteroInput disabled={disabled} controller={controller} />
      ) : (
        <ReadwiseInput disabled={disabled} controller={controller} />
      )}
    </section>
  );
}
function ZoteroInput({
  disabled,
  controller,
}: {
  disabled: boolean;
  controller: ImportController;
}): JSX.Element {
  return (
    <>
      <p>
        Install the experimental Zotero 10.0.x exporter, then use{" "}
        <strong>Tools → Export for mdbase Reader…</strong>. Select the whole exported folder—not
        Zotero’s data directory.
      </p>
      <p>
        <a href={`${import.meta.env.BASE_URL}downloads/mdbase-reader-exporter-0.1.0.xpi`} download>
          Download Zotero exporter (.xpi)
        </a>
      </p>
      <label className="import-file">
        Exported folder
        <input
          type="file"
          multiple
          disabled={disabled}
          ref={(node) => {
            node?.setAttribute("webkitdirectory", "");
          }}
          onChange={(e) => controller.selectBundle(e.target.files)}
        />
      </label>
      <p>
        Every payload checksum is verified before collection writes. Currently requires a browser
        with folder selection support, such as Chrome.
      </p>
    </>
  );
}
function ReadwiseInput({
  disabled,
  controller,
}: {
  disabled: boolean;
  controller: ImportController;
}): JSX.Element {
  const [token, setToken] = useState("");
  const [includeFeed, setIncludeFeed] = useState(false);
  return (
    <>
      <p>
        Get your{" "}
        <a href="https://readwise.io/access_token" target="_blank" rel="noreferrer">
          Readwise access token
        </a>
        . It stays in memory in this tab and is sent only to Readwise. Although the token allows
        writes, this importer only reads.
      </p>
      <label>
        API token
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          disabled={disabled}
          onChange={(e) => setToken(e.target.value)}
        />
      </label>
      <label className="import-checkbox">
        <input
          type="checkbox"
          checked={includeFeed}
          disabled={disabled}
          onChange={(e) => setIncludeFeed(e.target.checked)}
        />
        Include unsaved Feed items (archived library items are included either way)
      </label>
      <p>
        Scanning reads Reader metadata, saved article HTML and every Readwise highlight, including
        Kindle, Apple Books, Instapaper and other classic sources (those import as metadata and
        highlights, without the book text). Original PDFs and EPUBs download only after
        confirmation. Readwise limits request rates, so large libraries take several minutes.
      </p>
      <button
        type="button"
        disabled={disabled || !token.trim()}
        onClick={() => {
          controller.scan(token, includeFeed);
          setToken("");
        }}
      >
        Scan Readwise library
      </button>
    </>
  );
}
