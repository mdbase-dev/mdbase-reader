/** Renderer integration, without creating a surface or fetching embedded resources. */
export async function archivedHtmlTextExtractor(): Promise<(bytes: Uint8Array) => string> {
  const { extractArchivedHtmlText } = await import("@mdbase-reader/renderer-html");
  return (bytes) => extractArchivedHtmlText(new TextDecoder().decode(bytes));
}
