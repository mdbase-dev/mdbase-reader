/**
 * The isolated page cannot inherit the app's colours, so it copies the frame element's
 * text and background and the app's colour scheme, and copies them again when the app
 * root's attributes or the system scheme change.
 */
export function followEmbedderPalette(frame: HTMLIFrameElement): () => void {
  const document = frame.contentDocument;
  const embedder = frame.ownerDocument;
  const view = embedder.defaultView;
  if (!document || !view) {
    throw new Error("The isolated HTML document is unavailable.");
  }
  const apply = (): void =>
    applyHtmlPalette(
      document,
      view.getComputedStyle(frame),
      view.getComputedStyle(embedder.documentElement),
    );
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(embedder.documentElement, { attributes: true });
  const media = view.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", apply);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", apply);
  };
}

function applyHtmlPalette(
  document: Document,
  frame: CSSStyleDeclaration,
  root: CSSStyleDeclaration,
): void {
  let style = document.head.querySelector<HTMLStyleElement>("style[data-mdbase-reader='palette']");
  if (!style) {
    style = document.createElement("style");
    style.dataset["mdbaseReader"] = "palette";
    document.head.append(style);
  }
  const dark = root.colorScheme.split(/\s+/u)[0] === "dark";
  document.documentElement.dataset["readerScheme"] = dark ? "dark" : "light";
  style.textContent = `:root { color-scheme: ${dark ? "dark" : "light"}; background: ${frame.backgroundColor}; color: ${frame.color}; }`;
}
