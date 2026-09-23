import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@mdbase-reader/ui/styles.css";
import "./reader.css";
import "./reader-improvements.css";
import "./annotation-polish.css";
import "./reader-shell.css";

import { ConnectReader } from "./ConnectReader.js";
import { ImportPage } from "./ImportPage.js";
import { importService } from "./import-navigation.js";
import { EnvironmentBadge } from "./EnvironmentBadge.js";
import { PreviewReader } from "./preview.js";
import "./environment-badge.css";

const root = document.querySelector<HTMLElement>("#root");
if (!root) {
  throw new Error("Reader root element is missing.");
}
const migrationService = importService(location.pathname);
createRoot(root).render(
  <StrictMode>
    <EnvironmentBadge />
    {migrationService ? (
      <ImportPage service={migrationService} />
    ) : new URL(location.href).searchParams.has("preview") ? (
      <PreviewReader />
    ) : (
      <ConnectReader />
    )}
  </StrictMode>,
);
