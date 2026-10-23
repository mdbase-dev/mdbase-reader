import { t } from "@lingui/core/macro";

/** Injected functions return stable codes: Chrome serializes them without module imports. */
export function localizedCaptureError(reason: unknown): unknown {
  const message = reason instanceof Error ? reason.message : String(reason);
  // Chrome may prefix an injected exception with "Error: "; never inspect translated prose.
  const code = message.slice(message.lastIndexOf("reader/"));
  let translated: string;
  switch (code) {
    case "reader/https-only":
      translated = t`Reader can capture ordinary HTTPS pages only.`;
      break;
    case "reader/highlights-unsupported":
      translated = t`This browser cannot display highlights. Open the saved copy in Reader.`;
      break;
    case "reader/ambiguous-post-selection":
      translated = t`The selected passage is ambiguous inside this post. Select a longer passage.`;
      break;
    case "reader/post-not-loaded":
      translated = t`The post is not loaded. Scroll it into view and try again.`;
      break;
    case "reader/tab-navigated":
      translated = t`The tab navigated away.`;
      break;
    default:
      return reason;
  }
  const error = new Error(translated, { cause: reason });
  error.name = "ReaderCaptureError";
  return error;
}
