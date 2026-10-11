import { MdbaseConnect, type MdbaseApplicationDeclaration } from "@mdbase-dev/sdk";

export { describeError, isMdbaseError } from "@mdbase-dev/sdk";

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
  MdbaseSetupPlan,
} from "@mdbase-dev/sdk";

/** Reader's declaration for the public SDK entry: the unchanged canonical manifest
 * (logical ID, name, homepage origin) and the deployment environment. The SDK
 * registers the manifest and rebinds to the actual registered application ID before
 * any storage; sign-in, consent, selection and setup belong to the SDK. No storage,
 * runtime or trust overrides are passed. Construction performs no IO. */
export function createReaderApplication(input: {
  readonly environment: MdbaseApplicationDeclaration["environment"];
  readonly manifest: { readonly id: string; readonly name: string; readonly homepage: string };
}): MdbaseConnect {
  return new MdbaseConnect({
    id: input.manifest.id,
    name: input.manifest.name,
    origin: new URL(input.manifest.homepage).origin,
    environment: input.environment,
    manifest: input.manifest,
  });
}
