import { describe, expect, it } from "vitest";

import { deploymentUpdateAvailable, parseDeploymentRevision } from "./use-deployment-update.js";

describe("Reader deployment updates", () => {
  it("accepts a bounded deployment revision document", () => {
    expect(parseDeploymentRevision({ revision: "f8efdbcbac9a" })).toEqual({
      revision: "f8efdbcbac9a",
    });
    expect(parseDeploymentRevision({ revision: "../new-build" })).toBeNull();
    expect(parseDeploymentRevision({ revision: 42 })).toBeNull();
  });

  it("offers a reload only when a deployed build differs from this build", () => {
    expect(deploymentUpdateAvailable("f8efdbcbac9a", "next12345678")).toBe(true);
    expect(deploymentUpdateAvailable("f8efdbcbac9a", "f8efdbcbac9a")).toBe(false);
    expect(deploymentUpdateAvailable("local", "next12345678")).toBe(false);
  });
});
