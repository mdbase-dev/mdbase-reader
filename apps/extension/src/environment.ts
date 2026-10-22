export interface ExtensionEnvironment {
  readonly target: "lab" | "staging" | "production";
  /** Shown in the panel header; empty for production. */
  readonly label: string;
  readonly connectUrl: string;
  /** The SDK's log service, when this environment has SDK release trust. */
  readonly logUrl: string | null;
  readonly loopbackUrl: string;
  readonly readerOrigin: string;
  /** The extension origins this build declares to mdbase for its exact environment. */
  readonly extensionOrigins: readonly string[];
  /** PUBLIC SPKI only, supplied at staging packaging time; never a private key. */
  readonly stagingPublicKey?: string;
}

declare const __READER_EXTENSION_ENVIRONMENT__: ExtensionEnvironment;

/** Chosen at build time with MDBASE_ENV; see scripts/extension-manifest.mjs. */
export const environment: ExtensionEnvironment = __READER_EXTENSION_ENVIRONMENT__;
