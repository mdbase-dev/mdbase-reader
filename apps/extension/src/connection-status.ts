import type { ReaderConnectSnapshot } from "@mdbase-reader/connect";

/** A selected collection is not necessarily available for requests. */
export function connectionUnavailableMessage(snapshot: ReaderConnectSnapshot): string {
  switch (snapshot.status) {
    case "authorization_required":
      return "Approve access to this collection before saving.";
    case "setup_review_required":
      return "Review and apply this collection's setup before saving.";
    case "blocked":
      return snapshot.problem.message;
    case "start_failed":
      return `Could not connect: ${snapshot.problem.message}. Retry the connection; your draft is kept.`;
    case "unavailable":
      return "This collection is temporarily unavailable. Check mdbase Connect and retry the connection; your draft is kept.";
    case "unselected":
      return snapshot.connections.length
        ? "Choose a collection before saving."
        : "Connect a collection before saving.";
    default:
      return "mdbase Connect is still getting ready. Try again in a moment.";
  }
}
