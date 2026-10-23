import { describe, expect, it } from "vitest";

import { captureCitationProvenance } from "./capture-citation-provenance.js";

const dismissal = {
  rejected: [{ value: "Dismissed press", from: "user" }],
};

describe("capture citation provenance", () => {
  it("keeps dismissals on absent and edited fields while filtering stale capture evidence", () => {
    const rejected = [{ value: "Dismissed title", from: "user" }];
    const provenance = {
      id: { value: "remote-key", source: "registry:doi.org" },
      title: { value: "Original", source: "page:html", rejected },
      publisher: dismissal,
      language: { value: "en", source: "page:html" },
    };
    expect(captureCitationProvenance({ id: "local-key", title: "Typed" }, provenance)).toEqual({
      title: provenance.title,
      publisher: dismissal,
    });
    expect(provenance).toHaveProperty("language");
  });

  it("keeps old matching entries unchanged", () => {
    const title = { value: "Original", source: "page:html" };
    expect(captureCitationProvenance({ title: "Original" }, { title })).toEqual({ title });
  });
});
