// Which SDK backs Reader's session. The current Connect SDK stays the default until cutover.

export type ReaderSdkBackend = "connect" | "next";

/**
 * Picks the backend the way Reader picks its server: a `?sdk=next` URL flag first,
 * then `VITE_MDBASE_SDK=next` at build time. Anything else is the Connect SDK.
 */
export function readerSdkBackend(
  urlFlag: string | null | undefined,
  buildSetting?: string,
): ReaderSdkBackend {
  const choice = (urlFlag ?? buildSetting ?? "").trim().toLowerCase();
  return choice === "next" ? "next" : "connect";
}
