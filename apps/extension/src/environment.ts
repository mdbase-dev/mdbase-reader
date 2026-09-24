export interface ExtensionEnvironment {
  readonly target: "lab" | "staging" | "production";
  /** Shown in the panel header; empty for production. */
  readonly label: string;
  readonly connectUrl: string;
  readonly loopbackUrl: string;
  readonly readerOrigin: string;
}

declare const __READER_EXTENSION_ENVIRONMENT__: ExtensionEnvironment;

/** Chosen at build time with MDBASE_ENV; see scripts/extension-manifest.mjs. */
export const environment: ExtensionEnvironment = __READER_EXTENSION_ENVIRONMENT__;
