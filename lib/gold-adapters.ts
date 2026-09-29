/** Official gold QUANTITY adapters. Copy into lib/; no automatic scheduling is enabled here.
 * Add GoldFormat to RefreshSpec.format and route those formats to fetchGoldSource.
 * ECB F11A is bullion only, not gold + receivables. Never splice the old RA total into it.
 */
import type { RefreshSpec } from "./refresh";
import type { Point } from "./model";

export type GoldFormat =
  | "gold-safe"
  | "gold-mof"
  | "gold-treasury"
  | "gold-ecb";
export type GoldRefreshSpec = Omit<RefreshSpec, "format"> & {
  format: GoldFormat;
};
export const TROY_OUNCE_TONNES = 0.0000311034768;
const key = (area: string) =>
  `RAS.M.N.${area}.W19.S121.S1N.LE.A.FA.R.F11A._Z.XGO.XAU._Z.N.ALL`;
export const goldSpecs: GoldRefreshSpec[] = [
  {
    indicator: "cn.gold_reserves",
    provider: "SAFE",
    series: "Official reserve assets / 黄金数量（万盎司）",
    url: "https://www.safe.gov.cn/safe/gfcbzc/",
    dateColumn: "YYYY.MM",
    valueColumn: "万盎司",
    divisor: 1,
    format: "gold-safe",
    minDate: "2016-01-01",
  },
  {
    indicator: "jp.gold_reserves",
    provider: "MOF Japan",
    series: "Official reserves / I.A.(4) gold volume",
    url: "https://www.mof.go.jp/policy/international_policy/reference/official_reserve_assets/historical.csv",
    dateColumn: "Japanese era year and month",
    valueColumn: "(volume [in million fine troy ounces])",
    divisor: 1,
    format: "gold-mof",
    minDate: "2000-04-01",
  },
  {
    indicator: "us.gold_reserves_treasury",
    provider: "U.S. Treasury FiscalData",
    series: "gold_reserve / fine_troy_ounce_qty",
    url: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/gold_reserve?sort=record_date&page%5Bsize%5D=10000&page%5Bnumber%5D=1",
    dateColumn: "record_date",
    valueColumn: "fine_troy_ounce_qty",
    divisor: 1,
    format: "gold-treasury",
    minDate: "2012-01-01",
  },
  ...(
    [
      { area: "U2", id: "ea.gold_bullion_eurosystem" },
      { area: "4F", id: "ecb.gold_bullion" },
    ] as const
  ).map(({ area, id }) => ({
    indicator: id,
    provider: "ECB",
    series: key(area),
    url: `https://data-api.ecb.europa.eu/service/data/RAS/${key(area).slice(4)}?format=csvdata`,
    dateColumn: "TIME_PERIOD",
    valueColumn: "OBS_VALUE",
    divisor: 1,
    format: "gold-ecb" as const,
    select: { REF_AREA: area },
    minDate: "2013-01-01",
  })),
];

// Standalone CSV parser supports quoting, commas and newlines inside fields.
export function goldCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    s = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        s += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(s);
      s = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(s);
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      s = "";
    } else s += c;
  }
  if (quoted) throw new Error("CSV引号不完整，保留旧数据。");
  if (s !== "" || row.length) {
    row.push(s);
    rows.push(row);
  }
  return rows;
}
function number(text: string): number {
  const s = String(text).replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(s))
    throw new Error("黄金数量不是有效的非负数字。");
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error("黄金数量无效。");
  return n;
}
function validated(
  points: Point[],
  now = new Date(),
  minDate = "1900-01-01",
): Point[] {
  const current = now.toISOString().slice(0, 7),
    seen = new Set<string>();
  const result = points
    .filter((p) => p[0] >= minDate && p[0].slice(0, 7) < current)
    .sort((a, b) => a[0].localeCompare(b[0]));
  for (const p of result) {
    if (
      !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(p[0]) ||
      seen.has(p[0]) ||
      !Number.isFinite(p[1]) ||
      p[1] < 0 ||
      p[1] > 20000
    )
      throw new Error("黄金数据日期、数量或重复记录校验失败。");
    seen.add(p[0]);
  }
  if (!result.length) throw new Error("没有完整月份的黄金数量，保留旧数据。");
  return result;
}
function clean(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([\da-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
function safeUrl(href: string, base: string): string {
  const u = new URL(href.replace(/&amp;/g, "&"), base);
  if (
    u.protocol !== "https:" ||
    !["www.safe.gov.cn", "safe.gov.cn"].includes(u.hostname) ||
    u.username ||
    u.password
  )
    throw new Error("SAFE来源链接不在官方域名，保留旧数据。");
  return u.href;
}
function anchors(html: string): Array<{ href: string; label: string }> {
  return [
    ...html.matchAll(
      /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    ),
  ].map((m) => ({ href: m[1], label: clean(m[2]) }));
}
export function discoverSafeAnnualTables(
  html: string,
  base = "https://www.safe.gov.cn/safe/gfcbzc/",
  now = new Date(),
): Array<{ year: number; url: string }> {
  const m = new Map<number, string>();
  for (const a of anchors(html)) {
    const y = a.label.match(/官方储备资产\s*[（(]\s*(\d{4})/);
    if (y && Number(y[1]) <= now.getUTCFullYear() && Number(y[1]) >= 2016) {
      const url = safeUrl(a.href, base);
      if (m.has(Number(y[1])) && m.get(Number(y[1])) !== url)
        throw new Error("SAFE年度表链接有歧义。");
      m.set(Number(y[1]), url);
    }
  }
  if (!m.size) throw new Error("未找到SAFE年度官方储备表，保留旧数据。");
  return [...m]
    .map(([year, url]) => ({ year, url }))
    .sort((a, b) => b.year - a.year);
}
// Expand colspan and rowspan only inside tabular cells. Reject implausible spans.
function htmlTables(html: string): string[][][] {
  return [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(
    (table) => {
      const grid: string[][] = [];
      [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].forEach(
        (tr, r) => {
          grid[r] ??= [];
          let c = 0;
          for (const cell of tr[1].matchAll(
            /<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi,
          )) {
            while (grid[r][c] !== undefined) c++;
            const span = (attr: string) =>
              Number(
                cell[1].match(
                  new RegExp(`\\b${attr}\\s*=\\s*["']?(\\d+)`, "i"),
                )?.[1] || 1,
              );
            const cs = span("colspan"),
              rs = span("rowspan");
            if (cs > 50 || rs > 100 || cs < 1 || rs < 1)
              throw new Error("SAFE表格结构变化。");
            const value = clean(cell[2]);
            for (let dr = 0; dr < rs; dr++) {
              grid[r + dr] ??= [];
              for (let dc = 0; dc < cs; dc++) grid[r + dr][c + dc] = value;
            }
            c += cs;
          }
        },
      );
      return grid;
    },
  );
}
export function parseSafeGoldHtml(
  html: string,
  year: number,
  ref: string,
  now = new Date(),
): Point[] {
  const result = new Map<string, number>();
  let matched = false;
  for (const table of htmlTables(html)) {
    const header = table.find(
      (r) =>
        r.filter((x) => new RegExp(`^${year}\\.(0[1-9]|1[0-2])$`).test(x))
          .length >= 2,
    );
    if (!header) continue;
    for (const row of table) {
      for (let c = 0; c < row.length; c++) {
        const q = row[c]?.match(/^([\d,.]+)\s*万盎司$/),
          period = header[c]?.match(/^(\d{4})\.(\d{2})$/);
        if (!q || !period) continue;
        matched = true;
        const date = `${period[1]}-${period[2]}-01`,
          value = number(q[1]) * 10000 * TROY_OUNCE_TONNES;
        // USD and SDR columns repeat the same physical quantity; require exact agreement.
        if (result.has(date) && Math.abs(result.get(date)! - value) > 1e-8)
          throw new Error("SAFE重复数量列不一致。");
        result.set(date, value);
      }
    }
  }
  if (!matched)
    throw new Error("SAFE表没有明确的万盎司数量，禁止以美元估值替代。");
  return validated(
    [...result].map(([d, v]) => [d, v, ref]),
    now,
    "2016-01-01",
  );
}
export function parseMofGoldCsv(
  text: string,
  ref: string,
  now = new Date(),
): Point[] {
  const rows = goldCsvRows(text),
    found = rows
      .flatMap((r, ri) => r.map((v, ci) => ({ v, ri, ci })))
      .filter((x) => /volume\s*\[in million fine troy ounces\]/i.test(x.v));
  if (found.length !== 1) throw new Error("日本财务省黄金数量单位栏变化。");
  const col = found[0].ci;
  let year = 0;
  const points: Point[] = [];
  for (const r of rows.slice(found[0].ri + 1)) {
    const era = r[0]?.trim().match(/^(平成|令和)(元|\d+)年$/),
      explicit = r[2]?.trim();
    if (era)
      year =
        (era[1] === "平成" ? 1988 : 2018) +
        (era[2] === "元" ? 1 : Number(era[2]));
    if (/^\d{4}$/.test(explicit || "")) {
      if (era && year !== Number(explicit))
        throw new Error("日本财务省年份不一致。");
      year = Number(explicit);
    }
    const mon = r[1]?.trim().match(/^(\d{1,2})月$/);
    if (!mon) continue;
    if (!year || Number(mon[1]) < 1 || Number(mon[1]) > 12)
      throw new Error("日本财务省年月无法解析。");
    if (!r[col]?.trim()) continue;
    points.push([
      `${year}-${mon[1].padStart(2, "0")}-01`,
      number(r[col]) * 1e6 * TROY_OUNCE_TONNES,
      ref,
    ]);
  }
  return validated(points, now, "2000-04-01");
}
const treasuryKeys = [
  ["Mint Held Gold - Deep Storage", "Gold Bullion", "Denver, CO"],
  ["Mint Held Gold - Deep Storage", "Gold Bullion", "Fort Knox, KY"],
  ["Mint Held Gold - Deep Storage", "Gold Bullion", "West Point, NY"],
  [
    "Mint Held Gold - Working Stock",
    "Gold Coins",
    "All Locations- Coins, blanks, miscellaneous",
  ],
  [
    "Federal Reserve Bank Held Gold",
    "Gold Bullion",
    "Federal Reserve Banks - NY Vault",
  ],
  [
    "Federal Reserve Bank Held Gold",
    "Gold Bullion",
    "Federal Reserve Banks - Display",
  ],
  [
    "Federal Reserve Bank Held Gold",
    "Gold Coins",
    "Federal Reserve Banks - NY Vault",
  ],
  [
    "Federal Reserve Bank Held Gold",
    "Gold Coins",
    "Federal Reserve Banks - Display",
  ],
].map((r) => r.join("|"));
export function parseTreasuryGoldJson(
  text: string,
  ref: string,
  now = new Date(),
): Point[] {
  const obj = JSON.parse(text);
  if (!Array.isArray(obj.data)) throw new Error("财政部JSON结构变化。");
  const groups = new Map<string, Map<string, bigint>>();
  for (const r of obj.data) {
    const date = String(r.record_date || ""),
      labels = [r.facility_desc, r.form_desc, r.location_desc].map(String),
      k = labels.join("|");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new Error("财政部记录日期无效。");
    // Some HTML/CSV mirrors include subtotals. Never add them to the eight disjoint custody rows.
    if (labels.some((s) => /\b(?:sub[- ]?total|grand total|total)\b/i.test(s)))
      continue;
    if (!treasuryKeys.includes(k))
      throw new Error("财政部黄金库存分类变化，需人工复核。");
    const v = String(r.fine_troy_ounce_qty).match(/^(\d+)(?:\.(\d{1,3}))?$/);
    if (!v) throw new Error("财政部黄金盎司数无效。");
    if (!groups.has(date)) groups.set(date, new Map());
    const g = groups.get(date)!;
    if (g.has(k)) throw new Error("财政部库存明细重复，禁止重复合计。");
    g.set(k, BigInt(v[1]) * BigInt(1000) + BigInt((v[2] || "").padEnd(3, "0")));
  }
  const points: Point[] = [];
  for (const [d, g] of groups) {
    if (g.size !== 8) throw new Error("财政部当月8项黄金库存不完整。");
    const total = [...g.values()].reduce((a, b) => a + b, BigInt(0));
    points.push([
      d.slice(0, 7) + "-01",
      (Number(total) / 1000) * TROY_OUNCE_TONNES,
      ref,
    ]);
  }
  return validated(points, now, "2012-01-01");
}
export function parseEcbBullionCsv(
  text: string,
  area: "U2" | "4F",
  ref: string,
  now = new Date(),
): Point[] {
  const rows = goldCsvRows(text),
    header = rows.shift() || [];
  const needed = {
    KEY: key(area),
    FREQ: "M",
    REF_AREA: area,
    FLOW_STOCK_ENTRY: "LE",
    INSTR_ASSET: "F11A",
    UNIT_MEASURE: "XGO",
    CURRENCY_DENOM: "XAU",
    UNIT_MULT: "6",
    TIME_PER_COLLECT: "E",
  };
  for (const name of [...Object.keys(needed), "TIME_PERIOD", "OBS_VALUE"])
    if (!header.includes(name)) throw new Error("ECB黄金条块字段变化。");
  const at = (row: string[], field: string) => row[header.indexOf(field)] || "";
  const points: Point[] = [];
  for (const r of rows) {
    if (at(r, "REF_AREA") !== area) continue;
    if (Object.entries(needed).some(([k, v]) => at(r, k) !== v))
      throw new Error("ECB黄金条块统计口径变化。");
    const value = at(r, "OBS_VALUE");
    if (["", ".", "NA"].includes(value)) continue;
    points.push([
      at(r, "TIME_PERIOD") + "-01",
      number(value) * 1e6 * TROY_OUNCE_TONNES,
      ref,
    ]);
  }
  return validated(points, now, "2013-01-01");
}
export function parseGold(
  kind: GoldFormat,
  text: string,
  ref: string,
  options: { now?: Date; year?: number; area?: "U2" | "4F" } = {},
): Point[] {
  const now = options.now || new Date();
  if (kind === "gold-mof") return parseMofGoldCsv(text, ref, now);
  if (kind === "gold-treasury") return parseTreasuryGoldJson(text, ref, now);
  if (kind === "gold-ecb")
    return parseEcbBullionCsv(text, options.area || "U2", ref, now);
  if (!options.year) throw new Error("SAFE解析需要年度。");
  return parseSafeGoldHtml(text, options.year, ref, now);
}
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
export async function fetchGoldSource(
  spec: GoldRefreshSpec,
  fetcher: Fetcher = fetch,
  now = new Date(),
) {
  const ref = "live_" + spec.indicator,
    provenance: Array<{ url: string; text: string }> = [];
  const get = async (url: string, encoding = "utf-8") => {
    const allowed = [
      "www.safe.gov.cn",
      "safe.gov.cn",
      "www.mof.go.jp",
      "api.fiscaldata.treasury.gov",
      "data-api.ecb.europa.eu",
    ];
    const u = new URL(url);
    if (u.protocol !== "https:" || !allowed.includes(u.hostname))
      throw new Error("黄金来源域名未授权。");
    const r = await fetcher(url, {
      signal: AbortSignal.timeout(20000),
      headers: { Accept: "text/csv, application/json, text/html" },
    });
    if (!r.ok) throw new Error(`黄金来源返回${r.status}，保留旧数据。`);
    const bytes = await r.arrayBuffer();
    if (bytes.byteLength > 12_000_000)
      throw new Error("黄金来源过大，需人工检查。");
    const text = new TextDecoder(encoding).decode(bytes);
    provenance.push({ url, text });
    return text;
  };
  let text = "",
    points: Point[] = [],
    sourceURL = spec.url;
  if (spec.format === "gold-safe") {
    const index = await get(spec.url),
      tables = discoverSafeAnnualTables(index, spec.url, now).slice(0, 2);
    // Latest two years ensure >=12 observations for mergeSource and catch December revisions.
    for (const table of tables) {
      let html = await get(table.url),
        url = table.url;
      if (!html.includes("万盎司")) {
        const link = anchors(html).find(
          (a) => a.label.toLowerCase() === "html",
        );
        if (!link)
          throw new Error("SAFE最新表缺少可校验的HTML数量，需人工检查。");
        url = safeUrl(link.href, url);
        html = await get(url);
      }
      points.push(...parseSafeGoldHtml(html, table.year, ref, now));
    }
    points = validated(points, now, spec.minDate);
    text = JSON.stringify(provenance);
    sourceURL = tables[0].url;
  } else if (spec.format === "gold-treasury") {
    const first = JSON.parse(await get(spec.url));
    const count = Number(first.meta?.["total-pages"] || 1);
    if (!Number.isInteger(count) || count < 1 || count > 20)
      throw new Error("财政部分页数量异常。");
    const data = [...(first.data || [])];
    for (let p = 2; p <= count; p++) {
      const u = new URL(spec.url);
      u.searchParams.set("page[number]", String(p));
      data.push(...JSON.parse(await get(u.href)).data);
    }
    text = JSON.stringify({ ...first, data });
    points = parseTreasuryGoldJson(text, ref, now);
  } else {
    text = await get(
      spec.url,
      spec.format === "gold-mof" ? "shift_jis" : "utf-8",
    );
    points =
      spec.format === "gold-mof"
        ? parseMofGoldCsv(text, ref, now)
        : parseEcbBullionCsv(
            text,
            (spec.select?.REF_AREA || "U2") as "U2" | "4F",
            ref,
            now,
          );
  }
  return { text, ref, points, sourceURL, provenance };
}
