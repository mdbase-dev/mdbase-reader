import { t } from "@lingui/core/macro";
/** The stored `note` type is shown as a comment so it is not confused with the literature note. */
export function annotationKindLabel(type: string): string {
  switch (type) {
    case "note":
      return t({ message: "Comment", context: "Annotation type, distinct from literature note" });
    case "highlight":
      return t({ message: "Highlight", context: "Annotation kind" });
    case "area":
      return t`Area`;
    case "bookmark":
      return t`Bookmark`;
    default:
      return type.charAt(0).toLocaleUpperCase() + type.slice(1);
  }
}
