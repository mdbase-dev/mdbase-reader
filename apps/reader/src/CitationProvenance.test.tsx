import { describe, expect, it } from "vitest";

import { CitationProvenance } from "./CitationProvenance.js";
import { renderToStaticMarkup } from "./testing/i18n.js";

describe("CitationProvenance", () => {
  it("lists sourced fields but not the citekey", () => {
    const html = renderToStaticMarkup(
      <CitationProvenance
        citation={{ id: "kingma2014", title: "Adam" }}
        provenance={{}}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain("<dt>Title</dt>");
    expect(html).not.toMatch(/<dt>I[dD]<\/dt>/u);
  });
});
