import { describe, expect, it } from "vitest";

import {
  assertReaderManifestOrigin,
  readerBuildEnvironment,
  readerDeploymentOrigins,
} from "./build-environment.js";

describe("Reader build environment", () => {
  it("accepts exactly lab, staging and production", () => {
    expect(readerBuildEnvironment("lab")).toBe("lab");
    expect(readerBuildEnvironment("staging")).toBe("staging");
    expect(readerBuildEnvironment("production")).toBe("production");
  });

  it("refuses missing and unknown environments instead of falling back", () => {
    expect(() => readerBuildEnvironment(undefined)).toThrow(/Unsupported/u);
    expect(() => readerBuildEnvironment("")).toThrow(/Unsupported/u);
    expect(() => readerBuildEnvironment("qa")).toThrow(/Unsupported/u);
    expect(() => readerBuildEnvironment("LAB")).toThrow(/Unsupported/u);
    expect(() => readerBuildEnvironment(" staging ")).toThrow(/Unsupported/u);
    expect(() => readerBuildEnvironment("local")).toThrow(/Unsupported/u);
  });

  it("names the exact deployment origin of every environment", () => {
    expect(readerDeploymentOrigins).toEqual({
      lab: "https://lab.mdbase-reader.pages.dev",
      staging: "https://staging.mdbase-reader.pages.dev",
      production: "https://reader.mdbase.dev",
    });
  });

  it("admits a manifest whose homepage origin is its environment's exact origin", () => {
    expect(() =>
      assertReaderManifestOrigin("lab", "https://lab.mdbase-reader.pages.dev/"),
    ).not.toThrow();
    expect(() =>
      assertReaderManifestOrigin("staging", "https://staging.mdbase-reader.pages.dev/"),
    ).not.toThrow();
    expect(() =>
      assertReaderManifestOrigin("production", "https://reader.mdbase.dev/"),
    ).not.toThrow();
  });

  it("refuses a manifest retargeted from another environment", () => {
    expect(() => assertReaderManifestOrigin("staging", "https://reader.mdbase.dev/")).toThrow(
      /staging/u,
    );
    expect(() =>
      assertReaderManifestOrigin("staging", "https://lab.mdbase-reader.pages.dev/"),
    ).toThrow(/staging/u);
    expect(() =>
      assertReaderManifestOrigin("production", "https://staging.mdbase-reader.pages.dev/"),
    ).toThrow(/production/u);
    expect(() => assertReaderManifestOrigin("lab", "https://reader.mdbase.dev/")).toThrow(/lab/u);
    expect(() => assertReaderManifestOrigin("production", "not a url")).toThrow();
  });

  it("keeps production on its exact HTTPS origin and allows app loopback for LAB only", () => {
    expect(() => assertReaderManifestOrigin("lab", "http://127.0.0.1:5173/")).not.toThrow();
    expect(() => assertReaderManifestOrigin("staging", "http://127.0.0.1:5173/")).toThrow();
    expect(() => assertReaderManifestOrigin("production", "http://127.0.0.1:5173/")).toThrow();
    expect(() => assertReaderManifestOrigin("production", "http://reader.mdbase.dev/")).toThrow();
  });
});
