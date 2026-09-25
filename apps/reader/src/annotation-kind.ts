/** The stored `note` type is shown as a comment so it is not confused with the literature note. */
export function annotationKindLabel(type: string): string {
  return type === "note" ? "Comment" : type.charAt(0).toLocaleUpperCase() + type.slice(1);
}
