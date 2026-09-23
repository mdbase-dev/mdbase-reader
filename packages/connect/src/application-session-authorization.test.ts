import { expect, it, vi } from "vitest";

import { ReaderApplicationSession } from "./application-session.js";

import type * as Connect from "@mdbase-dev/connect";

const { authorize } = vi.hoisted(() => ({
  authorize: vi.fn().mockResolvedValue({ ok: true, value: { kind: "redirecting" } }),
}));
vi.mock("@mdbase-dev/connect", async (importOriginal) => ({
  ...(await importOriginal<typeof Connect>()),
  MdbaseConnect: class {
    application(): unknown {
      return { authorize };
    }
  },
  MdbaseBrowserSelection: vi.fn(),
}));

it("gives popup approval a human-scale budget without extending ordinary redirect requests", async () => {
  const session = new ReaderApplicationSession({
    serverUrl: "https://connect.example.test",
    redirectUri: "https://reader.example.test/",
    fallbackPath: "/",
    manifest: {
      manifest_version: 1,
      id: "dev.mdbase.reader",
      name: "Reader",
      homepage: "https://reader.example.test/",
      requirements: {
        access: "full_collection",
        contracts: [],
        capabilities: { contract_version: 1, required: ["collection.inspect"] },
      },
    },
  });
  await session.authorize("choose", true);
  expect(authorize).toHaveBeenLastCalledWith("choose", {
    presentation: "popup",
    timeoutMs: 600_000,
  });
  await session.authorize("selected");
  expect(authorize).toHaveBeenLastCalledWith("selected", {});
});
