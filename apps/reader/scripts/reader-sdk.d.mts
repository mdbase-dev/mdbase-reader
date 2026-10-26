export type ReaderSdkTarget = "lab" | "staging" | "production";
export interface ReaderSdkReceipt {
  environment: ReaderSdkTarget;
  cpOrigin: string;
  artifact: string;
  sha256: string;
}
export function readerSdkTarget(environment: Record<string, string | undefined>): ReaderSdkTarget;
export function verifiedReaderSdk(
  target: ReaderSdkTarget,
  repoRoot?: string,
  app?: "apps/reader" | "apps/extension",
): Promise<{
  aliases: { find: RegExp; replacement: string }[];
  offlineShellUrl: string;
  receipt: ReaderSdkReceipt;
}>;
