import type { ReaderConnectSnapshot } from "@mdbase-reader/connect";

export function requiresAccessReview(message: string | null): boolean {
  return Boolean(
    message &&
    /(?:exact application declaration|application declaration bound to this grant)/iu.test(message),
  );
}

export function connectionStatus(
  session: Exclude<ReaderConnectSnapshot, { status: "ready" }>,
): string {
  switch (session.status) {
    case "opening":
      return "Finding mdbase Connect…";
    case "authorization_required":
      return "Reader needs your approval to open this collection.";
    case "checking_setup":
      return "Checking the collection’s Reader contracts…";
    case "unavailable":
      return `This collection is ${session.reason.replaceAll("_", " ")}.`;
    case "blocked":
      return session.problem.message;
    case "setup_review_required":
      return "Review the Reader definitions before they are installed.";
    default:
      return "Choose a collection to open in Reader.";
  }
}

export function isLocalhost(current: Location): boolean {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(current.hostname);
}
