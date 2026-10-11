import { createApplicationFixture } from "@mdbase-reader/connect/testing";

import manifest from "../generated/mdbase-app.json";

import type { MdbaseApplicationSnapshot } from "@mdbase-reader/connect/native";

const facet = { checking: false, assessment: null, problem: null };

/** A complete signed-out public snapshot, for the SDK's own application fixture. */
export const signedOutSnapshot: MdbaseApplicationSnapshot = {
  status: "signed_out",
  signIn: null,
  collections: [],
  selectedCollectionId: null,
  problem: null,
  timing: null,
  selection: {
    state: "none",
    requested: { collectionId: null, source: "none", displayName: null, approved: false },
    usable: null,
    problem: null,
  },
  readiness: {
    ...facet,
    facets: {
      capabilities: facet,
      contracts: facet,
      configuration: facet,
      files: facet,
      people: facet,
      notifications: facet,
    },
  },
};

/** The SDK's public application fixture: test metadata only, never runtime evidence. */
export function applicationFixture(
  initial: Partial<MdbaseApplicationSnapshot> = {},
): ReturnType<typeof createApplicationFixture> {
  return createApplicationFixture({
    declaration: {
      id: "reader.extension.fixture",
      name: manifest.name,
      origin: "chrome-extension://kimdfjefhbfgfecconmaiaaindjccidp",
      environment: "lab",
      installationKind: "app-runtime",
      manifest,
    },
    connections: [],
    initialSnapshot: { ...signedOutSnapshot, ...initial },
  });
}
