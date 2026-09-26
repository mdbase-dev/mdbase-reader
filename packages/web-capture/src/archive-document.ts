/**
 * A content archive, not a copy of the site's application state. Rebuild from an
 * allowlist rather than trying to enumerate every framework's secret-bearing
 * attributes. URLs and arbitrary metadata are deliberately not retained here;
 * source provenance and structured citation metadata are stored separately.
 * Visible prose can still be private: this is minimization, not anonymization.
 */
export function archiveDocument(source: Document): string {
  const output = source.implementation.createHTMLDocument(source.title);
  const structural = new Set(
    "article aside main section nav header footer div span p h1 h2 h3 h4 h5 h6 blockquote pre code em strong b i u s small sub sup mark br hr ul ol li dl dt dd table caption thead tbody tfoot tr th td figure figcaption abbr time details summary".split(
      " ",
    ),
  );
  const discard = new Set(
    "script style template noscript iframe frame frameset object embed portal form input textarea select option button svg math canvas audio video source track link meta base".split(
      " ",
    ),
  );
  const copy = (node: Node, parent: Node): void => {
    if (node.nodeType === 3) {
      parent.appendChild(output.createTextNode(node.textContent ?? ""));
      return;
    }
    if (node.nodeType !== 1) {
      return;
    } // No comments or processing instructions.
    const element = node as Element;
    const tag = element.localName.toLowerCase();
    if (
      discard.has(tag) ||
      element.hasAttribute("hidden") ||
      element.getAttribute("aria-hidden") === "true" ||
      element.hasAttribute("contenteditable") ||
      element.hasAttribute("data-mdbase-reader-ui") ||
      element.hasAttribute("data-mdbase-reader-highlights") ||
      /(?:display\s*:\s*none|visibility\s*:\s*hidden)/iu.test(element.getAttribute("style") ?? "")
    ) {
      return;
    }
    // Unknown/custom elements (and links) retain text, never executable markup.
    const target = structural.has(tag) ? output.createElement(tag) : output.createElement("span");
    parent.appendChild(target);
    for (const child of element.childNodes) {
      copy(child, target);
    }
  };
  for (const node of source.body.childNodes) {
    copy(node, output.body);
  }
  const csp = output.createElement("meta");
  csp.httpEquiv = "Content-Security-Policy";
  csp.content = "default-src 'none'; base-uri 'none'; form-action 'none'";
  output.head.prepend(csp);
  return `<!doctype html>\n${output.documentElement.outerHTML}`;
}
