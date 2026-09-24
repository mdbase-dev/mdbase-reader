/** Which renderer a document needs, from its media type or, failing that, its file name. */
export function isPdf(mediaType: string, file: string): boolean {
  return mediaType === "application/pdf" || /\.pdf(?:\]\])?$/iu.test(file);
}

export function isEpub(mediaType: string, file: string): boolean {
  return mediaType === "application/epub+zip" || /\.epub(?:\]\])?$/iu.test(file);
}

export function isHtml(mediaType: string, file: string): boolean {
  return (
    ["text/html", "application/xhtml+xml"].includes(mediaType) || /\.html?(?:\]\])?$/iu.test(file)
  );
}
