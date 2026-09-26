import { expect, it, vi } from "vitest";

import { connectedReaderCollection } from "./application-session.js";

import type { ReaderConnectSnapshot } from "./application-session.js";
import type { MdbaseConnection, MdbaseConnectionInfo } from "@mdbase-dev/connect";

it("reuses repositories only for the same ready connection, without stale transport snapshots", () => {
  const listeners: ((info: MdbaseConnectionInfo) => void)[] = [];
  let status: MdbaseConnectionInfo["directAccess"] = "permission_required";
  const info = (): MdbaseConnectionInfo =>
    ({
      displayName: "Local",
      authority: { kind: "connector" },
      route: "relay",
      directAccess: status,
    }) as MdbaseConnectionInfo;
  const connection = {
    collectionId: "local",
    files: {},
    info,
    onConnectionChange: (listener: (info: MdbaseConnectionInfo) => void) => {
      listeners.push(listener);
      return vi.fn();
    },
  } as unknown as MdbaseConnection;
  const snapshot = {
    status: "ready",
    info: info(),
    collectionId: "local",
    connections: [],
  } as unknown as ReaderConnectSnapshot;
  const first = connectedReaderCollection(snapshot, connection)!;
  expect(connectedReaderCollection(snapshot, connection)).toBe(first);
  expect(connectedReaderCollection(snapshot, connection, "other")).toBeNull();
  expect(connectedReaderCollection({ status: "starting", connections: [] }, connection)).toBeNull();
  expect(
    connectedReaderCollection(snapshot, {
      collectionId: "local",
      files: {},
      info,
    } as unknown as MdbaseConnection),
  ).not.toBe(first);
  const access = first.directAccess;
  expect(access.getSnapshot()).toBe(access.getSnapshot());
  const a = vi.fn(),
    b = vi.fn();
  access.subscribe(a);
  access.subscribe(b);
  status = "available";
  for (const listener of listeners) {
    listener(info());
  }
  expect(a).toHaveBeenCalledOnce();
  expect(b).toHaveBeenCalledOnce();
  expect(access.getSnapshot()?.status).toBe("available");
  expect(access.getSnapshot()).toBe(access.getSnapshot());
});
