import { expect, it } from "vitest";

import { cslDate } from "./csl-values.js";

it.each([
  ["Mar 21, 2007", [2007, 3, 21]],
  ["March 21 2007", [2007, 3, 21]],
  ["21 Mar. 2007", [2007, 3, 21]],
  ["October 2024", [2024, 10]],
  ["2024", [2024]],
  ["2005-04-23T20:31:52-07:00", [2005, 4, 23]],
])("parses the date %s deterministically, without inventing precision", (value, parts) => {
  expect(cslDate(value)).toEqual({ "date-parts": [parts] });
});

it.each([undefined, "Not a date", "03/04/2024", "Mar 45, 2007", "2024-13-03", "Marching 2007"])(
  "does not parse ambiguous or invalid date %s",
  (value) => expect(cslDate(value)).toBeUndefined(),
);
