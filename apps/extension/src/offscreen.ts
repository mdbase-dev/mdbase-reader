import { createMdbase } from "@mdbase-reader/connect/native";

import { extensionDeclaration, sessionBuild } from "./sdk-declaration.js";

// The only context that hosts the shared SDK Worker. It has no visible UI;
// sign-in is opened by the SDK entry in the page or service worker that requests it.
const mdbase = createMdbase(extensionDeclaration(), {
  session: { build: sessionBuild },
  followVisibility: false,
});
mdbase.setForeground(false);
void mdbase.start().catch(() => undefined);
