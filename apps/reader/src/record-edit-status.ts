import type { RecordSessionState } from "@mdbase-reader/connect";

/** Reader's editor notice groups the SDK's native states without owning settlement. */
export function recordEditStatus(
  state: RecordSessionState,
): "saved" | "saving" | "unsaved" | "error" {
  switch (state) {
    case "saved":
    case "saved_on_device":
      return "saved";
    case "saving":
      return "saving";
    case "unsaved":
    case "conflict":
      return "unsaved";
    default:
      return "error";
  }
}
