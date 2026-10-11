import type {
  MdbaseApplicationConnection,
  MdbaseApplicationSnapshot,
  MdbaseApplicationEntry,
} from "@mdbase-reader/connect/native";

function readyEvidence(snapshot: MdbaseApplicationSnapshot): boolean {
  const { readiness } = snapshot;
  return (
    snapshot.status === "ready" &&
    !!snapshot.selectedCollectionId &&
    !readiness.checking &&
    readiness.problem === null &&
    readiness.assessment?.status === "ready" &&
    readiness.assessment.problem === null
  );
}

/** Only the SDK's current aggregate evidence and original borrowed client qualify. */
export function isReadyReaderConnection(
  connection: MdbaseApplicationConnection,
  snapshot: MdbaseApplicationSnapshot,
): boolean {
  return (
    readyEvidence(snapshot) &&
    connection.id === snapshot.selectedCollectionId &&
    connection.records.hello.collection === connection.id &&
    connection.isCurrent()
  );
}

export function readyReaderConnection(
  sdk: MdbaseApplicationEntry,
  snapshot: MdbaseApplicationSnapshot,
): MdbaseApplicationConnection | null {
  const selected = snapshot.selectedCollectionId;
  if (!selected || !readyEvidence(snapshot)) {
    return null;
  }
  const connection = sdk.connection(selected);
  return connection && isReadyReaderConnection(connection, snapshot) ? connection : null;
}
