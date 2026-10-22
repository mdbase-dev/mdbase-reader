import type { SdkApplicationEnvironment } from "@mdbase-reader/connect/native";

/** The environment this Reader build targets, named explicitly at build time. */
export type ReaderBuildEnvironment = SdkApplicationEnvironment;

/**
 * The exact HTTPS origin each environment's Reader deployment is served from.
 * Keep in step with scripts/deployment-environment.mjs, which deploys to them.
 */
export const readerDeploymentOrigins: Readonly<Record<ReaderBuildEnvironment, string>> =
  Object.freeze({
    lab: "https://lab.mdbase-reader.pages.dev",
    staging: "https://staging.mdbase-reader.pages.dev",
    production: "https://reader.mdbase.dev",
  });

const loopbackHostnames = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * The build environment from `VITE_MDBASE_ENV`, exact or nothing: an unknown or
 * missing value refuses to start rather than selecting another environment.
 */
export function readerBuildEnvironment(value: string | undefined): ReaderBuildEnvironment {
  if (value === "lab" || value === "staging" || value === "production") {
    return value;
  }
  throw new Error(`Unsupported Reader build environment: ${value ?? "(unset)"}.`);
}

/**
 * Refuses a bundled manifest retargeted from another environment: its homepage
 * origin must be this environment's exact deployment origin. App loopback is
 * LAB-only, for local development against LAB; staging and production keep their
 * exact HTTPS origins.
 */
export function assertReaderManifestOrigin(
  environment: ReaderBuildEnvironment,
  homepage: string,
): void {
  let origin: string;
  try {
    origin = new URL(homepage).origin;
  } catch {
    throw new Error(`Reader ${environment} manifest homepage is not a URL: ${homepage}.`);
  }
  if (origin === readerDeploymentOrigins[environment]) {
    return;
  }
  if (environment === "lab") {
    const url = new URL(homepage);
    if (url.protocol === "http:" && loopbackHostnames.has(url.hostname)) {
      return;
    }
  }
  throw new Error(
    `Reader ${environment} requires a manifest for ${readerDeploymentOrigins[environment]}, received ${origin}.`,
  );
}
