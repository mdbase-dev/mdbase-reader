import type { ContractSelector } from "@mdbase-dev/sdk";

export const sourceContract = {
  id: "dev.mdbase.reader.source",
  version: "1.0.0-beta.1",
} as const satisfies ContractSelector;

export const annotationContract = {
  id: "dev.mdbase.reader.annotation",
  version: "1.0.0-beta.1",
} as const satisfies ContractSelector;
