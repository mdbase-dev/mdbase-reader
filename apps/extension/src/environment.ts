export interface ExtensionEnvironment {
  readonly target: "lab" | "staging" | "production";
  /** Shown in the panel header; empty for production. */
  readonly label: string;
  readonly connectUrl: string;
  readonly loopbackUrl: string;
  readonly readerOrigin: string;
  /** `next` opts into the mdbase-next SDK backend (MDBASE_SDK=next at build time). */
  readonly sdk?: "connect" | "next";
}

declare const __READER_EXTENSION_ENVIRONMENT__: ExtensionEnvironment;

/** Chosen at build time with MDBASE_ENV; see scripts/extension-manifest.mjs. */
export const environment: ExtensionEnvironment = __READER_EXTENSION_ENVIRONMENT__;
