import { createMdbase, type Mdbase, type MdbaseApplicationDeclaration } from "@mdbase-dev/sdk";

export { MdbaseConnect, describeError, isMdbaseError, summarizeStatus } from "@mdbase-dev/sdk";

export { nativeReaderCollection } from "./native-collection.js";
export type { NativeReaderCollection } from "./native-collection.js";
export type {
  MdbaseApplication,
  MdbaseApplicationConnection,
  MdbaseApplicationDeclaration,
  MdbaseApplicationEntry,
  MdbaseApplicationSnapshot,
  MdbaseApplicationSelectionSnapshot,
  MdbaseErrorDescription,
  MdbaseConnectOptions,
  MdbaseSignInOpener,
  MdbaseSetupPlan,
  Mdbase,
  MdbaseSnapshot,
} from "@mdbase-dev/sdk";

/** The exact first-party build environments Reader ships for. */
export type SdkApplicationEnvironment = "lab" | "staging" | "production";

/** Exact pass-through to the authenticated target SDK environment type.
 * The a3023aee staging intake includes PR #941; no cast or LAB retarget. */
export function sdkApplicationEnvironment(
  environment: SdkApplicationEnvironment,
): MdbaseApplicationDeclaration["environment"] {
  return environment;
}

/** Reader's mdbase entry (`createMdbase`) from the unchanged canonical manifest
 * (logical ID, name, homepage origin) and the deployment environment. The SDK
 * registers the manifest and rebinds to the actual registered application ID before
 * any storage; sign-in, consent, selection and setup belong to the SDK. No storage,
 * runtime or trust overrides are passed. Construction performs no IO. */
export function createReaderMdbase(input: {
  readonly environment: SdkApplicationEnvironment;
  readonly manifest: { readonly id: string; readonly name: string; readonly homepage: string };
}): Mdbase {
  return createMdbase(
    {
      id: input.manifest.id,
      name: input.manifest.name,
      origin: new URL(input.manifest.homepage).origin,
      environment: sdkApplicationEnvironment(input.environment),
      manifest: input.manifest,
    },
    { followVisibility: true },
  );
}
