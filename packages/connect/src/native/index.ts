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

/** Reader's mdbase entry (`createMdbase`) from the unchanged canonical manifest
 * (logical ID, name, homepage origin) and the deployment environment. The SDK
 * registers the manifest and rebinds to the actual registered application ID before
 * any storage; sign-in, consent, selection and setup belong to the SDK. No storage,
 * runtime or trust overrides are passed. Construction performs no IO. */
export function createReaderMdbase(input: {
  readonly environment: MdbaseApplicationDeclaration["environment"];
  readonly manifest: { readonly id: string; readonly name: string; readonly homepage: string };
}): Mdbase {
  return createMdbase(
    {
      id: input.manifest.id,
      name: input.manifest.name,
      origin: new URL(input.manifest.homepage).origin,
      environment: input.environment,
      manifest: input.manifest,
    },
    { followVisibility: true },
  );
}
