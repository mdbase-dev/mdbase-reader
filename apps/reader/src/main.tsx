import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@mdbase-reader/ui/styles.css";
import "./reader.css";

import { PreviewReader } from "./preview.js";

const root = document.querySelector<HTMLElement>("#root");
if (!root) {
  throw new Error("Reader root element is missing.");
}
createRoot(root).render(
  <StrictMode>
    <PreviewReader />
  </StrictMode>,
);
