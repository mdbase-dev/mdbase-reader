/** The stored `note` type is shown as a comment so it is not confused with the source note. */
export function annotationKindLabel(type: string): string {
  return type === "note"
    ? "Source comment"
    : type === "area"
      ? "Area capture"
      : type.charAt(0).toLocaleUpperCase() + type.slice(1);
}
