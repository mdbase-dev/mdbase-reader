import { describe, expect, it } from "vitest";

import { publicationDateLabel } from "./library-publication-date.js";

describe("publicationDateLabel", () => {
  it("formats partial CSL-style dates for display", () => {
    expect(publicationDateLabel("1974-3-9")).toBe("9 Mar 1974");
    expect(publicationDateLabel("2023-1")).toBe("Jan 2023");
    expect(publicationDateLabel(1982)).toBe("1982");
  });

  it("shows a recorded date-time as its date", () => {
    expect(publicationDateLabel("2006-06-30T22:22:49Z")).toBe("30 Jun 2006");
    expect(publicationDateLabel("2021-11-02T09:15:00.000+01:00")).toBe("2 Nov 2021");
    expect(publicationDateLabel("2021-11-02 09:15")).toBe("2 Nov 2021");
    expect(publicationDateLabel("2021-11-02Tlater")).toBe("2021-11-02Tlater");
  });

  it("preserves descriptive and invalid dates", () => {
    expect(publicationDateLabel("Spring 2022")).toBe("Spring 2022");
    expect(publicationDateLabel("2022-14-2")).toBe("2022-14-2");
    expect(publicationDateLabel(undefined)).toBeNull();
  });
});
