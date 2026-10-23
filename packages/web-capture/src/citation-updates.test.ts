import { beforeEach, describe, expect, it, vi } from "vitest";

import { lookUpCitationClaims } from "./citation-updates.js";
import { citoidClaims, doiClaims } from "./provider-claims.js";

vi.mock("./provider-claims.js", () => ({ citoidClaims: vi.fn(), doiClaims: vi.fn() }));

beforeEach(() => {
  vi.mocked(citoidClaims).mockReset();
  vi.mocked(doiClaims).mockReset();
  vi.mocked(doiClaims).mockResolvedValue({ claims: [] });
});

describe("citation update claims", () => {
  it.each(["", "refresh"])("refreshes only the current identifiers: %j", async (query) => {
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
      { query, doi: "10.1234/existing", url: "https://example.org" },
      { signal },
    );
    expect(citoidClaims).toHaveBeenCalledWith("https://example.org", { signal });
    expect(doiClaims).toHaveBeenCalledTimes(2);
    expect(doiClaims).toHaveBeenCalledWith("10.1234/existing", { signal });
    expect(doiClaims).toHaveBeenCalledWith("10.1234/discovered", { signal });
    expect(claims).toHaveLength(1);
  });

  it.each(["10.1234/typed", "doi:10.1234/typed", "  10.1234/typed  "])(
    "does not mix a typed DOI with the current work: %j",
    async (query) => {
      await lookUpCitationClaims({
        query,
        doi: "10.1234/existing",
        url: "https://existing.example",
      });
      expect(citoidClaims).not.toHaveBeenCalled();
      expect(doiClaims).toHaveBeenCalledExactlyOnceWith("10.1234/typed", {});
    },
  );

  it("only uses the typed URL and its discovered identifier", async () => {
    vi.mocked(citoidClaims).mockResolvedValue({
      claims: [],
      identifiers: { doi: "10.1234/discovered" },
    });
    await lookUpCitationClaims({
      query: "https://typed.example",
      url: "https://existing.example",
      doi: "10.1234/existing",
    });
    expect(citoidClaims).toHaveBeenCalledExactlyOnceWith("https://typed.example", {});
    expect(doiClaims).toHaveBeenCalledExactlyOnceWith("10.1234/discovered", {});
  });

  it("keeps an explicit DOI URL pinned to its identifier", async () => {
    vi.mocked(citoidClaims).mockResolvedValue({
      claims: [],
      identifiers: { doi: "10.1234/unrelated" },
    });
    await lookUpCitationClaims({
      query: "https://doi.org/10.1234/typed",
      doi: "10.1234/existing",
    });
    expect(citoidClaims).toHaveBeenCalledExactlyOnceWith("https://doi.org/10.1234/typed", {});
    expect(doiClaims).toHaveBeenCalledExactlyOnceWith("10.1234/typed", {});
  });
});
