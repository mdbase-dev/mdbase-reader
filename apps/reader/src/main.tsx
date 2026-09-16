import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@mdbase-reader/ui/styles.css";
import "./reader.css";
import "./reader-improvements.css";

import { ConnectReader } from "./ConnectReader.js";
import { EnvironmentBadge } from "./EnvironmentBadge.js";
import { PreviewReader } from "./preview.js";
import "./environment-badge.css";

const root = document.querySelector<HTMLElement>("#root");
if (!root) {
  throw new Error("Reader root element is missing.");
}
createRoot(root).render(
  <StrictMode>
    <EnvironmentBadge />
    {new URL(location.href).searchParams.has("preview") ? <PreviewReader /> : <ConnectReader />}
  </StrictMode>,
);
