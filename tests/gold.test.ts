// Run offline: node --experimental-strip-types work/platform-expansion/gold-adapters.test.ts
import assert from "node:assert/strict";

import {
  discoverSafeAnnualTables,
  parseSafeGoldHtml,
  parseMofGoldCsv,
  parseTreasuryGoldJson,
  parseEcbBullionCsv,
  goldSpecs,
  fetchGoldSource,
} from "../lib/gold-adapters";
import f from "./fixtures/gold.json";
const now = new Date("2026-09-28T00:00:00Z");
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
assert.deepEqual(
  discoverSafeAnnualTables(f.safeIndex, undefined, now).map((x) => x.year),
  [2026, 2025],
);
near(
  parseSafeGoldHtml(f.safe2026, 2026, "s", now).at(-1)![1],
  f.expected.safeAugustTonnes,
);
assert.throws(
  () =>
    parseSafeGoldHtml(
      f.safe2026.replaceAll("万盎司", "亿美元"),
      2026,
      "s",
      now,
    ),
  /万盎司/,
);
assert.throws(
  () =>
    parseSafeGoldHtml(
      f.safe2026.replace("7608 万盎司", "7607 万盎司"),
      2026,
      "s",
      now,
    ),
  /不一致/,
);
assert.throws(
  () =>
    discoverSafeAnnualTables(
      f.safeIndex.replace(
        "/safe/2026/0206/27116.html",
        "https://evil.example/data",
      ),
      undefined,
      now,
    ),
  /官方域名/,
);
const jp = parseMofGoldCsv(f.mof, "s", now);
assert.equal(jp[1][0], "2026-01-01");
near(jp[1][1], f.expected.mofTonnes);
const us = parseTreasuryGoldJson(JSON.stringify(f.treasury), "s", now);
near(us[0][1], f.expected.treasuryJan2012Tonnes);
const subtotal = {
  ...f.treasury.data[0],
  facility_desc: "Grand Total",
  fine_troy_ounce_qty: "261498899.316",
};
near(
  parseTreasuryGoldJson(
    JSON.stringify({ data: [...f.treasury.data, subtotal] }),
    "s",
    now,
  )[0][1],
  us[0][1],
);
assert.throws(
  () =>
    parseTreasuryGoldJson(
      JSON.stringify({ data: f.treasury.data.slice(1) }),
      "s",
      now,
    ),
  /不完整/,
);
assert.throws(
  () =>
    parseTreasuryGoldJson(
      JSON.stringify({ data: [...f.treasury.data, f.treasury.data[0]] }),
      "s",
      now,
    ),
  /重复/,
);
const bullion = parseEcbBullionCsv(f.ecbBullion, "4F", "s", now);
near(bullion[0][1], f.expected.ecbDec2025BullionTonnes);
assert.ok(
  bullion[0][1] < 400,
  "F11A bullion must not be labelled 506.5t total gold",
);
assert.throws(
  () =>
    parseEcbBullionCsv(f.ecbBullion.replaceAll("XGO", "EUR"), "4F", "s", now),
  /口径/,
);
