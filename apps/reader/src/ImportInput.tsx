import { Trans, useLingui } from "@lingui/react/macro";
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
      <h2 id="import-input-title">
        <Trans>Choose what to bring</Trans>
      </h2>
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
  const { t } = useLingui();
  return (
    <>
      <p>
        <Trans>
          The experimental exporter supports Zotero 10.0.x only and requires a signed-in Zotero
          account. It exports all of <strong>My Library</strong>, excluding group libraries and
          trash.
        </Trans>
      </p>
      <ol className="import-instructions">
        <li>
          <Trans>
            <a
              href={`${import.meta.env.BASE_URL}downloads/mdbase-reader-exporter-0.1.0.xpi`}
              download
            >
              Download Zotero exporter (.xpi)
            </a>
          </Trans>
        </li>
        <li>
          <Trans>
            In Zotero, open <strong>Tools → Plugins</strong> and drag the downloaded .xpi file into
            the Plugins window.
          </Trans>
        </li>
        <li>
          <Trans>
            Finish syncing, then choose <strong>Tools → Export for mdbase Reader…</strong>. Keep
            Zotero open and avoid editing until the export finishes.
          </Trans>
        </li>
        <li>
          <Trans>
            Return here and select the whole generated export folder—not its parent folder or
            Zotero’s data directory.
          </Trans>
        </li>
      </ol>
      <label className="import-file">
        {t({ message: "Exported folder" })}
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
        <Trans>
          Every payload checksum is verified before collection writes. Currently requires a browser
          with folder selection support, such as Chrome.
        </Trans>
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
  const { t } = useLingui();
  const [token, setToken] = useState("");
  const [includeFeed, setIncludeFeed] = useState(false);
  return (
    <>
      <p>
        <Trans>
          Get your{" "}
          <a href="https://readwise.io/access_token" target="_blank" rel="noreferrer">
            Readwise access token
          </a>
          . It stays in memory in this tab and is sent only to Readwise. Although the token allows
          writes, this importer only reads.
        </Trans>
      </p>
      <label>
        {t({ message: "API token" })}
        <input
          className="mdbase-field"
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
        {t({
          message: "Include unsaved Feed items (archived library items are included either way)",
        })}
      </label>
      <p>
        <Trans>
          Scanning reads Reader metadata, saved article HTML and every Readwise highlight, including
          Kindle, Apple Books, Instapaper and other classic sources (those import as metadata and
          highlights, without the book text). Original PDFs and EPUBs download only after
          confirmation. Readwise limits request rates, so large libraries take several minutes.
        </Trans>
      </p>
      <button
        type="button"
        disabled={disabled || !token.trim()}
        onClick={() => {
          controller.scan(token, includeFeed);
          setToken("");
        }}
      >
        <Trans>Scan Readwise library</Trans>
      </button>
    </>
  );
}
