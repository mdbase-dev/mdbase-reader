import { createContext } from "react";

import type { SourceSummary } from "@mdbase-reader/core";

/** The progressively loaded workspace index is shared by all note editors. */
export const SourceLibraryContext = createContext<readonly SourceSummary[]>([]);
