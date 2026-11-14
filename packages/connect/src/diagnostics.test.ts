import { expect, it } from "vitest";

import { transportTiming } from "./transport-timing.js";

it("extracts only numeric transport timings for explicitly allowed origins", () => {
  const entry = {
    name: "https://connect.example/secret-id?token=secret",
    initiatorType: "fetch",
    startTime: 10,
    duration: 40,
    requestStart: 15,
    responseStart: 45,
    responseEnd: 50,
  };
  const timing = transportTiming(entry, ["https://connect.example"], 5);
  expect(timing).toEqual({
    transport: "cloud",
    startedMs: 5,
    elapsedMs: 40,
    responseWaitMs: 30,
    transferMs: 5,
  });
  expect(transportTiming(entry, [], 5)).toBeNull();
  expect(transportTiming(entry, ["https://connect.example"], 11)).toBeNull();
  expect(
    transportTiming({ ...entry, requestStart: 0, responseStart: 0 }, ["https://connect.example"], 5)
      ?.responseWaitMs,
  ).toBeNull();
});
