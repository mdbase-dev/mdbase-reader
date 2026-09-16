import { createContext } from "react";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";

export const AnnotationEditingContext = createContext<ReaderWorkspaceGateway | null>(null);
