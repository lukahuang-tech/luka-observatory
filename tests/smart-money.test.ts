import assert from "node:assert/strict";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import encoded from "../data/smart-money-seed";
import {
  actionResolver,
  aggregateSmart,
  comparisonIssue,
  currentQuarters,
  exactQuarter,
  mergeSmartData,
  parseSmartImport,
  quarterTimeline,
  securityKey,
  smartResearchContext,
  validateSmartData,
} from "../lib/smart-money";
const raw = JSON.parse(gunzipSync(Buffer.from(encoded, "base64")).toString());
const data = validateSmartData(raw);
test("original 13F snapshot migrates without losing fields, quarters or holdings", () => {
  assert.deepEqual(data, raw);
  assert.equal(data.fundOrder.length, 20);
  assert.equal(
    Object.values(data.funds).reduce((n, f) => n + f.quarters.length, 0),
    79,
  );
  assert.equal(
    Object.values(data.funds).reduce(
      (n, f) => n + f.quarters.reduce((m, q) => m + q.holdings.length, 0),
      0,
    ),
    24781,
  );
});
test("same-quarter comparisons exclude missing reports and derivatives", () => {
  const current = currentQuarters(data, "2026-06-30");
  assert.equal(current.length, 17);
  assert.equal(exactQuarter(data.funds.scion, "2026-06-30"), undefined);
  const agg = aggregateSmart(data, "2026-06-30");
  assert(
    agg.every((a) =>
      a.funds.every((f) => !["scion", "pershing", "vanguard"].includes(f.key)),
    ),
  );
  const apple = agg.find((a) => a.cusip === "037833100")!;
  assert.equal(apple.funds.length, 10);
  assert.equal(new Set(apple.funds.map((f) => f.key)).size, 10);
  assert(agg.every((a) => a.id.endsWith("||SH")));
  const h = data.funds.brk.quarters[0].holdings[0];
  assert.equal(securityKey(h), securityKey({ ...h, class: "COMMON STOCK" }));
});
test("unverified bases, mixed prior options, and base-period deltas are not trading signals", () => {
  const jpm = data.funds.jpmorgan,
    q = jpm.quarters.find((q) => q.period === "2026-06-30")!;
  assert.match(comparisonIssue(jpm, q)!, /异常/);
  assert.equal(actionResolver(jpm, q)(q.holdings[0]), "unverified");
  const f = structuredClone(data.funds.brk),
    base = f.quarters.at(-1)!;
  assert.equal(actionResolver(f, base)(base.holdings[0]), "base");
  const [now, prev] = f.quarters;
  const h = now.holdings.find((h) =>
    prev.holdings.some((p) => p.cusip === h.cusip),
  )!;
  const p = prev.holdings.find((p) => p.cusip === h.cusip)!;
  p.putCall = "Put/Call";
  assert.equal(actionResolver(f, now)(h), "unverified");
});
test("imports only parse JSON, reject invalid data, and preserve omitted institutions and quarters", () => {
  const incoming = structuredClone(data);
  incoming.fundOrder = ["brk"];
  incoming.defaultKeys = ["brk"];
  incoming.funds = {
    brk: { ...data.funds.brk, quarters: [data.funds.brk.quarters[0]] },
  };
  const html =
    '<script>throw new Error("do not execute")</script>/*__13F_DATA_START__*/' +
    JSON.stringify(incoming) +
    "/*__13F_DATA_END__*/";
  const parsed = parseSmartImport(html);
  const merged = mergeSmartData(data, parsed);
  assert.equal(merged.fundOrder.length, 20);
  assert.equal(merged.funds.brk.quarters.length, 4);
  assert.deepEqual(merged.funds.scion, data.funds.scion);
  assert.throws(() => parseSmartImport("<script>alert(1)</script>"), /标记/);
  const bad = structuredClone(incoming);
  bad.funds.brk.quarters[0].holdings[0].value = -1;
  assert.throws(() => validateSmartData(bad), /格式/);
  const duplicate = structuredClone(incoming);
  duplicate.funds.brk.quarters.push(duplicate.funds.brk.quarters[0]);
  assert.throws(() => validateSmartData(duplicate), /重复季度/);
  const wrongCIK = structuredClone(incoming);
  wrongCIK.funds.brk.cik = "123";
  assert.throws(() => mergeSmartData(data, wrongCIK), /CIK/);
});
test("AI context includes source, scope, missing funds and unverified comparisons", () => {
  const c = smartResearchContext(data, "2026-06-30", 3);
  assert.equal(c.revision, 3);
  assert.equal(c.institutions.length, 17);
  assert.equal(c.missingFunds.length, 3);
  assert(
    c.institutions.every(
      (f) =>
        f.topHoldings.length <= 10 &&
        f.sourceUrl.startsWith("https://www.sec.gov/"),
    ),
  );
  assert(c.institutions.find((f) => f.key === "jpmorgan")?.comparisonIssue);
  assert(JSON.stringify(c).length < 180000);
});
test("older imports and failed quarters never replace a newer valid report", () => {
  const incoming = structuredClone(raw);
  incoming.generatedAt = "2026-08-01T00:00:00Z";
  incoming.funds.brk.updatedAt = "2026-08-01T00:00:00Z";
  incoming.funds.brk.quarters[0].holdings[0].value = 1;
  assert.deepEqual(
    mergeSmartData(data, validateSmartData(incoming)).funds.brk.quarters[0],
    data.funds.brk.quarters[0],
  );
  const fail = structuredClone(raw),
    q = fail.funds.brk.quarters[0];
  fail.funds.brk.updatedAt = "2026-09-01T00:00:00Z";
  fail.funds.brk.quarters[0] = {
    period: q.period,
    filingDate: q.filingDate,
    accession: q.accession,
    status: "missing",
    error: "timeout",
    totalValue: 0,
    holdingsCount: 0,
    holdings: [],
    exits: [],
  };
  const parsed = validateSmartData(fail),
    merged = mergeSmartData(data, parsed);
  assert.deepEqual(merged.funds.brk.quarters[0], data.funds.brk.quarters[0]);
  assert.match(merged.funds.brk.refreshError!, /失败/);
  assert.equal(quarterTimeline(parsed.funds.brk).at(-1)?.value, null);
  const gap = structuredClone(data.funds.brk);
  gap.quarters.splice(1, 1);
  assert.equal(quarterTimeline(gap).length, 4);
  assert.equal(quarterTimeline(gap)[2].value, null);
});
