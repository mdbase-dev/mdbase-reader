import { t as translate } from "@lingui/core/macro";
/** The stored `note` type is shown as a comment so it is not confused with the source note. */
export function annotationKindLabel(type: string): string {
  return type === "note"
    ? translate({ message: "Source comment" })
    : type === "area"
      ? translate({ message: "Area capture" })
      : type === "highlight"
        ? translate({ message: "Highlight", context: "Reader interface" })
        : type === "bookmark"
          ? translate`Bookmark`
          : type.charAt(0).toLocaleUpperCase() + type.slice(1);
}
