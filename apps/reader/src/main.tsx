import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@mdbase-reader/ui/styles.css";
import "./reader.css";

import { ConnectReader } from "./ConnectReader.js";
import { PreviewReader } from "./preview.js";

const root = document.querySelector<HTMLElement>("#root");
if (!root) {
  throw new Error("Reader root element is missing.");
}
createRoot(root).render(
  <StrictMode>
    {new URL(location.href).searchParams.has("preview") ? <PreviewReader /> : <ConnectReader />}
  </StrictMode>,
);
