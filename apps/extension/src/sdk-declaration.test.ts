import { describe, expect, it } from "vitest";

import { sdkEnvironment } from "./sdk-declaration.js";

describe("extension SDK environment", () => {
  it("names every build environment exactly, never mapping one to another", () => {
    expect(sdkEnvironment("lab")).toBe("lab");
    expect(sdkEnvironment("staging")).toBe("staging");
    expect(sdkEnvironment("production")).toBe("production");
  });
});
