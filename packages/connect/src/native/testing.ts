/** Test-only native fixtures for Reader apps: the SDK's public application fixture
 * and a real SDK client over MemoryReplica. Neither is native/LAB evidence. */
import {
  connect,
  MdbasePeopleClient,
  type Mdbase,
  type MdbaseApplicationConnection,
  type MdbaseApplicationEntry,
  type MdbaseSnapshot,
} from "@mdbase-dev/sdk";
import { MemoryReplica, type MemoryReplicaOptions } from "@mdbase-dev/sdk/testing";

export { createApplicationFixture, MemoryReplica } from "@mdbase-dev/sdk/testing";
export { mdbaseError } from "@mdbase-dev/sdk";
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

/** Test-only: the `createMdbase` front door over an application fixture, so the
 * shared collection screens can drive the SDK's public fixture. Mirrors the SDK's
 * own mapping (sign in = authorize, add = approve(null)). */
export function fixtureMdbase(fixture: { readonly entry: MdbaseApplicationEntry }): Mdbase {
  const app = fixture.entry.application();
  const view = (): MdbaseSnapshot => app.getSnapshot() as MdbaseSnapshot;
  const settle = async (pending: Promise<unknown>): Promise<MdbaseSnapshot> => {
    await pending;
    return view();
  };
  return {
    getSnapshot: view,
    subscribe: (listener) => app.subscribe(listener),
    start: (options) => settle(app.start(options)),
    signIn: (options) => settle(app.authorize(options)),
    addCollection: (options) => settle(app.approve(null, options)),
    approve: (id, options) => settle(app.approve(id, options)),
    select: (id, options) => settle(app.select(id, options)),
    chooseAnother: (options) => settle(app.chooseAnother(options)),
    forget: (id, options) => settle(app.forget(id, options)),
    deleteCollection: (id, options) => settle(app.deleteCollection(id, options)),
    requestAccess: (request, options) => app.requestAccess(request, options),
    assess: (options) => app.assess(options),
    setup: {
      plan: (options) => app.setup.plan(options),
      apply: async (plan, options) => ({
        outcome: "applied",
        snapshot: await settle(app.setup.apply(plan, options)),
      }),
    },
    connection: (id) => fixture.entry.connection(id),
    setForeground: (active) => app.setForeground(active),
    signOut: (options) =>
      app.signOut ? settle(app.signOut(options)) : Promise.reject(new Error("no signOut")),
    close: () => app.close(),
    application: app,
  };
}
