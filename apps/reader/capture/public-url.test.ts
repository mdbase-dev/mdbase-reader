import { describe, expect, it, vi } from "vitest";

import { isPublicAddress, parseCaptureUrl, publicCaptureUrl } from "./public-url.js";

describe("web capture URL policy", () => {
  it("accepts only public HTTPS origins without embedded credentials", async () => {
    const resolve = vi.fn(() => Promise.resolve(["93.184.216.34"]));

    await expect(publicCaptureUrl("https://example.com/read#part", resolve)).resolves.toMatchObject(
      {
        href: "https://example.com/read",
      },
    );
    expect(resolve).toHaveBeenCalledWith("example.com");
    expect(() => parseCaptureUrl("http://example.com")).toThrow("public HTTPS pages");
    expect(() => parseCaptureUrl("https://reader:secret@example.com")).toThrow(
      "public HTTPS pages",
    );
    expect(() => parseCaptureUrl("https://example.com:8443")).toThrow("public HTTPS pages");
  });

  it("rejects local names, literal private addresses, and private DNS answers", async () => {
    const resolvePrivate = vi.fn(() => Promise.resolve(["10.0.0.8"]));

    await expect(publicCaptureUrl("https://localhost/page", resolvePrivate)).rejects.toThrow(
      "private, local, or reserved",
    );
    await expect(publicCaptureUrl("https://127.0.0.1/page", resolvePrivate)).rejects.toThrow(
      "private, local, or reserved",
    );
    await expect(publicCaptureUrl("https://intranet.example/page", resolvePrivate)).rejects.toThrow(
      "private, local, or reserved",
    );
  });

  it("classifies representative public and reserved IP address ranges", () => {
    expect(isPublicAddress("93.184.216.34")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
    expect(isPublicAddress("10.0.0.1")).toBe(false);
    expect(isPublicAddress("169.254.169.254")).toBe(false);
    expect(isPublicAddress("192.0.2.10")).toBe(false);
    expect(isPublicAddress("::1")).toBe(false);
    expect(isPublicAddress("fc00::1")).toBe(false);
    expect(isPublicAddress("2001:db8::1")).toBe(false);
  });
});
