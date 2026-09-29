import "./gold.test";
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

test("composer keeps interest rates in percent and independent transformations", () => {
  const mixed: View = {
    ...view,
    ids: ["us.yield_10y", "us.m2_level"],
    frequency: "M",
    start: "2020-01-01",
    end: "2026-08-01",
    transform: "index",
  };
  const rate = selectPoints(data, "us.yield_10y", mixed);
  assert.equal(
    rate[0].value,
    data.observations["us.yield_10y"].find((p) => p[0] === "2020-01-01")![1],
  );
  assert.equal(selectPoints(data, "us.m2_level", mixed)[0].value, 100);
  const changed = {
    ...mixed,
    seriesOptions: {
      "us.yield_10y": { transform: "change" as const },
      "us.m2_level": { transform: "level" as const },
    },
  };
  const expected =
    data.observations["us.yield_10y"].find((p) => p[0] === "2020-01-01")![1] -
    data.observations["us.yield_10y"].find((p) => p[0] === "2019-01-01")![1];
  assert.equal(selectPoints(data, "us.yield_10y", changed)[0].value, expected);
  assert.notEqual(selectPoints(data, "us.m2_level", changed)[0].value, 100);
});

test("catalog expansion preserves saved observations and personal indicators", async () => {
  const { applyCatalogRelease } = await import("../lib/catalog");
  const existing = structuredClone(data);
  const custom = {
    ...structuredClone(existing.indicators[0]),
    id: "personal.qa",
  };
  existing.indicators.push(custom);
  existing.observations[custom.id] = [["2024-01-01", 123, custom.source[0]]];
  const enriched = applyCatalogRelease(existing);
  validateBackup(enriched);
  assert.deepEqual(
    enriched.observations[custom.id],
    existing.observations[custom.id],
  );
  assert.deepEqual(
    enriched.observations["us.yield_10y"],
    data.observations["us.yield_10y"],
  );
  assert(
    enriched.observations["us.fed_assets_historical"][0][0] < "1970-01-01",
  );
  assert.deepEqual(applyCatalogRelease(enriched), enriched);
  for (const ind of enriched.indicators.filter((i) => i.frequency === "A")) {
    const annual = selectPoints(enriched, ind.id, {
      ...view,
      start: "1900-01-01",
      end: "2026-12-01",
    });
    assert(annual.every((p) => p.date.endsWith("-01-01")));
  }
  const latest =
    derive(enriched).observations["ea.real_10y_ecb_changing_proxy"].at(-1)!;
  assert.equal(latest[0], "2026-08-01");
  assert(Math.abs(latest[1] - 0.4026326) < 1e-6);
});

test("weekly aggregation uses actual last date and rejects duplicate source dates", () => {
  const spec = refreshSpecs.find((s) => s.indicator === "us.fed_assets")!;
  const csv =
    "observation_date,WALCL\n2020-01-29,5000\n2020-01-01,4000\n2020-02-05,5100";
  assert.deepEqual(parseSource(csv, spec, "test"), [
    ["2020-01-01", 5000, "test"],
    ["2020-02-01", 5100, "test"],
  ]);
  assert.throws(() => parseSource(csv + "\n2020-01-29,3000", spec, "test"));
});

test("TIC fixture checks exact holdings unit and country code", async () => {
  const fixture = await import("./fixtures/tic.json");
  const spec = refreshSpecs.find(
    (s) => s.indicator === "cn.us_treasury_holdings_total",
  )!;
  const points = parseSource(fixture.default.text, spec, "test");
  assert.equal(points.at(-1)![1], 618.011);
  assert.throws(() =>
    parseSource(
      fixture.default.text.replace(
        "Millions of dollars",
        "Billions of dollars",
      ),
      spec,
      "test",
    ),
  );
  assert.throws(() =>
    parseSource(
      fixture.default.text.replaceAll("China, Mainland", "Japan"),
      spec,
      "test",
    ),
  );
});
