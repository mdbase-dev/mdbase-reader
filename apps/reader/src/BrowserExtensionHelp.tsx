import { Trans } from "@lingui/react/macro";
import { useId, type JSX } from "react";

import { readerExtensionOnDesktop, readerExtensionStoreUrl } from "./browser-extension.js";
import "./browser-extension.css";

export function BrowserExtensionLink(): JSX.Element {
  return readerExtensionOnDesktop() ? (
    <a
      className="reader-extension-link"
      href={readerExtensionStoreUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <Trans>Get Chrome extension</Trans>
    </a>
  ) : (
    <span className="reader-extension-availability">
      <Trans>Available in Chrome on a computer.</Trans>
    </span>
  );
}

export function BrowserExtensionHint({
  message,
}: {
  readonly message: string | null;
}): JSX.Element | null {
  return message ? (
    <div className="capture-follow-up" role="alert">
      <p>{message}</p>
      <BrowserExtensionLink />
    </div>
  ) : null;
}

export function BrowserExtensionDiscovery({
  placement,
}: {
  readonly placement: "add-source" | "empty-library";
}): JSX.Element {
  const headingId = useId();
  const Heading = placement === "add-source" ? "h3" : "h2";
  return (
    <section className={`reader-extension-discovery is-${placement}`} aria-labelledby={headingId}>
      <Heading className="reader-extension-heading" id={headingId}>
        <Trans>Save from your browser</Trans>
      </Heading>
      <p>
        <Trans>
          Save articles and PDFs, and highlight web pages as you read with the optional Chrome
          extension.
        </Trans>
      </p>
      <BrowserExtensionLink />
    </section>
  );
}
