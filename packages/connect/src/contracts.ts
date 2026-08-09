import type { DataContractSelector } from "@mdbase-dev/connect";

export const sourceContract = {
  id: "dev.mdbase.reader.source",
  version: "1.0.0-beta.1",
} as const satisfies DataContractSelector;

export const annotationContract = {
  id: "dev.mdbase.reader.annotation",
  version: "1.0.0-beta.1",
} as const satisfies DataContractSelector;
