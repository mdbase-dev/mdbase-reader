import { expect, it } from "vitest";

import { extensionDeclaration } from "./connect-session.js";

it("declares the extension's own origin, which its manifest lists for LAB", () => {
  const declaration = extensionDeclaration("kimdfjefhbfgfecconmaiaaindjccidp");
  expect(declaration).toMatchObject({
    origin: "chrome-extension://kimdfjefhbfgfecconmaiaaindjccidp",
    environment: "lab",
    installationKind: "app-runtime",
  });
  const { manifest } = declaration;
  expect(manifest).not.toHaveProperty("distribution", "portable");
  expect(manifest).toMatchObject({
    installation_origins: { lab: { "app-runtime": [declaration.origin] } },
  });
});
