import { describe, expect, it, vi } from "vitest";

import { lookUpCitationClaims } from "./citation-updates.js";
import { citoidClaims, doiClaims } from "./provider-claims.js";

vi.mock("./provider-claims.js", () => ({ citoidClaims: vi.fn(), doiClaims: vi.fn() }));

describe("citation update claims", () => {
  it("collects the source URL, existing DOI and discovered DOI without sending CSL", async () => {
    vi.mocked(citoidClaims).mockResolvedValue({
      claims: [
        {
          field: "title",
          value: "Remote",
          source: { kind: "generic-remote", name: "citoid" },
          observedAt: "now",
        },
      ],
      identifiers: { doi: "10.1234/discovered" },
    });
    vi.mocked(doiClaims).mockResolvedValue({ claims: [] });
    const signal = new AbortController().signal;
    const claims = await lookUpCitationClaims(
      { query: "10.1234/existing", doi: "10.1234/existing", url: "https://example.org" },
      { signal },
    );
    expect(citoidClaims).toHaveBeenCalledWith("https://example.org", { signal });
    expect(doiClaims).toHaveBeenCalledTimes(2);
    expect(doiClaims).toHaveBeenCalledWith("10.1234/existing", { signal });
    expect(doiClaims).toHaveBeenCalledWith("10.1234/discovered", { signal });
    expect(claims).toHaveLength(1);
  });
});
