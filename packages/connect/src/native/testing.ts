/** Test-only native fixtures for Reader apps: the SDK's public application fixture
 * and a real SDK client over MemoryReplica. Neither is native/LAB evidence. */
import { connect, MdbasePeopleClient, type MdbaseApplicationConnection } from "@mdbase-dev/sdk";
import { MemoryReplica, type MemoryReplicaOptions } from "@mdbase-dev/sdk/testing";

export { createApplicationFixture, MemoryReplica } from "@mdbase-dev/sdk/testing";
export type { ApplicationFixture } from "@mdbase-dev/sdk/testing";

export async function memoryConnection(options: MemoryReplicaOptions = {}): Promise<{
  readonly replica: MemoryReplica;
  readonly connection: MdbaseApplicationConnection;
  readonly setCurrent: (current: boolean) => void;
  readonly close: () => void;
}> {
  const replica = new MemoryReplica({ confirmDelayMs: 0, ...options });
  const client = await connect({
    connector: replica.connector(),
    app: { name: "reader-native-test", version: "test" },
    reconnect: false,
  });
  let current = true;
  const isCurrent = (): boolean => current;
  const connection: MdbaseApplicationConnection = {
    id: replica.collection,
    displayName: "Reading",
    scope: {
      account: "fixture-account",
      installation: "fixture-installation",
      collection: replica.collection,
    },
    generation: "fixture-generation",
    records: client,
    files: client.files,
    people: new MdbasePeopleClient(client, {
      collection: replica.collection,
      request: () => Promise.reject(new Error("No inferred metadata permission")),
      isCurrent,
    }),
    isCurrent,
  };
  return {
    replica,
    connection,
    setCurrent: (next) => {
      current = next;
    },
    close: () => client.close(),
  };
}
