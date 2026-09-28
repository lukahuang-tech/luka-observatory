import assert from "node:assert/strict";
import { test } from "node:test";
import seed from "../data/seed.json";
import fixtures from "./fixtures/refresh.json";
import { parseImport, validateBackup, csvRows } from "../lib/imports";
import { derive, parseSource, refreshSpecs, mergeSource } from "../lib/refresh";
import { selectPoints } from "../lib/model";
import { researchContext } from "../lib/research";
import type { Dataset, View } from "../lib/model";
const data = seed as unknown as Dataset;
const view: View = {
  space: "sovereign-rates",
  ids: ["us.real_10y_proxy", "ea.real_10y_proxy"],
  start: "1970-01-01",
  end: "2026-12-01",
  frequency: "A",
  transform: "level",
};
test("calendar pairing preserves CPI gaps and complete year counts", () => {
  const derived = derive(structuredClone(data));
  assert.equal(derived.observations["us.inflation_yoy"][0][0], "1970-01-01");
  assert(
    !derived.observations["us.real_10y_proxy"].some(
      (p) => p[0] === "2025-10-01",
    ),
  );
  const us = selectPoints(derived, "us.real_10y_proxy", view);
  assert.equal(us.find((p) => p.date === "2025-01-01")?.n, 11);
  assert.equal(
    selectPoints(derived, "ea.real_10y_proxy", view).find(
      (p) => p.date === "2026-01-01",
    )?.n,
    1,
  );
  const r = researchContext(derived, view, 1);
  assert(r.statistics[0].end !== "2026-01-01");
  for (const id of ["us.real_10y_proxy", "ea.real_10y_proxy"]) {
    const prev = new Map(data.observations[id].map((p) => [p[0], p[1]]));
    for (const p of derived.observations[id])
      assert(Math.abs(p[1] - prev.get(p[0])!) < 1e-5);
  }
});
test("bad upstream never mutates last good dataset", () => {
  const before = JSON.stringify(data);
  const spec = refreshSpecs[0];
  for (const text of [
    "<html>error</html>",
    "date,value\n2026-01,4",
    "observation_date,GS10\n",
    "observation_date,GS10\n2026-01-01,4\n2026-01-01,5",
  ])
    assert.throws(() => parseSource(text, spec, "test"));
  assert.equal(JSON.stringify(data), before);
});
test("unit conversion and precise official CSV mappings", () => {
  for (const f of fixtures.adapters) {
    const id =
      f.id === "oecd_national_cpi_yoy"
        ? "de.inflation_yoy"
        : f.expected[0].indicator_id;
    const spec = refreshSpecs.find((s) => s.indicator === id)!;
    assert(spec, id);
    const points = parseSource(f.sample_csv, spec, "fixture");
    const expected = f.expected.filter((p) => p.indicator_id === id);
    assert.deepEqual(
      points.map((p) => p.slice(0, 2)),
      expected.map((p) => [p.date, p.value]),
    );
    if (f.id === "ecb_bsi_m2")
      assert.throws(() =>
        parseSource(
          f.sample_csv.replaceAll(",EUR,6", ",EUR,9"),
          spec,
          "fixture",
        ),
      );
  }
});
test("CSV import rejects duplicates and preserves declared scale", () => {
  const input = {
    spaceId: "x",
    name: "test",
    unit: "%",
    region: "x",
    frequency: "M" as const,
    sourceUrl: "",
    definition: "",
    dateColumn: "date",
    valueColumn: "value",
    csv: "date,value\n2025-01,4\n2025-02,0.04\n2025-03,",
    filename: "test.csv",
  };
  const r = parseImport(input, "source");
  assert.deepEqual(
    r.points.map((p) => p[1]),
    [4, 0.04],
  );
  assert.equal(r.missing, 1);
  assert.throws(() =>
    parseImport({ ...input, csv: "date,value\n2025-01,4\n2025-01,5" }, "s"),
  );
  assert.deepEqual(csvRows('a,b\n"comma, value","quote ""test"""'), [
    ["a", "b"],
    ["comma, value", 'quote "test"'],
  ]);
});
test("backup roundtrip preserves data, registry and provenance", () => {
  const roundtrip = validateBackup(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(roundtrip, data);
  const bad = structuredClone(data);
  bad.observations[bad.indicators[0].id][0][2] = "unknown";
  assert.throws(() => validateBackup(bad));
});
test("source merges preserve archived historical segments", () => {
  const d = structuredClone(data);
  const spec = refreshSpecs.find((s) => s.indicator === "ea.m2_level")!;
  const pts = d.observations[spec.indicator]
    .slice(-24)
    .map((p) => [p[0], p[1], "test"] as [string, number, string]);
  const before = d.observations[spec.indicator].find(
    (p) => p[0] === "1970-01-01",
  );
  mergeSource(d, spec, pts, "test");
  assert.deepEqual(
    d.observations[spec.indicator].find((p) => p[0] === "1970-01-01"),
    before,
  );
});
