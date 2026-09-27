import { describe, expect, it } from "vitest";

import { connectProblemMessage, manifestForApplicationUrl } from "./application-session.js";

import type { ConnectOutcome, MdbaseAppManifest } from "@mdbase-dev/connect";

const manifest = {
  manifest_version: 1,
  id: "dev.mdbase.reader",
  name: "mdbase Reader",
  homepage: "https://reader.mdbase.dev/",
  icon: "https://reader.mdbase.dev/favicon.svg",
  redirect_uris: ["https://reader.mdbase.dev/"],
  requirements: {
    access: "full_collection",
    contracts: [],
    capabilities: { contract_version: 2, required: ["collection.read"] },
  },
} satisfies MdbaseAppManifest;

describe("ReaderApplicationSession helpers", () => {
  it("creates a same-origin localhost manifest for explicit local development", () => {
    expect(
      manifestForApplicationUrl(
        manifest,
        "http://127.0.0.1:5173/?collection=one",
        "http://127.0.0.1:5173/?server=http%3A%2F%2F127.0.0.1%3A8787",
      ),
    ).toMatchObject({
      homepage: "http://127.0.0.1:5173/",
      icon: "http://127.0.0.1:5173/favicon.svg",
      redirect_uris: ["http://127.0.0.1:5173/?server=http%3A%2F%2F127.0.0.1%3A8787"],
    });
  });

  it("turns expected Connect failures into user-facing messages", () => {
    const outcome = {
      ok: false,
      problem: { code: "connector_offline", message: "The connector is offline." },
    } as ConnectOutcome<unknown>;
    expect(connectProblemMessage(outcome)).toBe("The connector is offline.");
  });
});
