import {
  goldSpecs,
  fetchGoldSource,
  type GoldRefreshSpec,
} from "./gold-adapters";
import { csvRows, validatePoints } from "./imports";
import type { Dataset, Point } from "./model";
export type RefreshSpec = {
  indicator: string;
  provider: string;
  series: string;
  url: string;
  dateColumn: string;
  valueColumn: string;
  divisor: number;
  filters?: Record<string, string>;
  metadata?: Record<string, string>;
  select?: Record<string, string>;
  format?:
    | "tic"
    | "weekly"
    | "gold-safe"
    | "gold-mof"
    | "gold-treasury"
    | "gold-ecb";
  minDate?: string;
  includeCurrentMonth?: boolean;
};
export const refreshSpecs: RefreshSpec[] = [
  ...goldSpecs,
  ...[
    {
      indicator: "ea.yield_10y_ecb_changing",
      provider: "ECB",
      series: "IRS.M.U2.L.L40.CI.0000.EUR.N.Z",
      url: "https://data-api.ecb.europa.eu/service/data/IRS/M.U2.L.L40.CI.0000.EUR.N.Z?format=csvdata",
      dateColumn: "TIME_PERIOD",
      valueColumn: "OBS_VALUE",
      divisor: 1,
      filters: {
        KEY: "IRS.M.U2.L.L40.CI.0000.EUR.N.Z",
        FREQ: "M",
        REF_AREA: "U2",
        UNIT: "PC",
        UNIT_MULT: "0",
        COLLECTION: "A",
        IR_TYPE: "L",
        TR_TYPE: "L40",
        MATURITY_CAT: "CI",
        CURRENCY_TRANS: "EUR",
      },
    },
    {
      indicator: "ea.inflation_yoy_ecb_changing",
      provider: "ECB",
      series: "HICP.M.U2.N.000000.4D0.ANR",
      url: "https://data-api.ecb.europa.eu/service/data/HICP/M.U2.N.000000.4D0.ANR?format=csvdata",
      dateColumn: "TIME_PERIOD",
      valueColumn: "OBS_VALUE",
      divisor: 1,
      filters: {
        KEY: "HICP.M.U2.N.000000.4D0.ANR",
        FREQ: "M",
        REF_AREA: "U2",
        UNIT_MULT: "0",
        UNIT: "PCCH",
        ADJUSTMENT: "N",
        ICP_ITEM: "000000",
        DATA_PROVIDER: "4D0",
        ICP_SUFFIX: "ANR",
      },
    },
  ],
  ...Object.entries({
    "us.yield_10y": "GS10",
    "us.yield_20y": "GS20",
    "us.m2_level": "M2SL",
    "us.cpi_index": "CPIAUCNS",
    "us.tips_10y": "FII10",
    "us.tips_20y": "FII20",
    "uk.yield_10y": "IRLTLT01GBM156N",
    "fr.yield_10y": "IRLTLT01FRM156N",
    "de.yield_10y": "IRLTLT01DEM156N",
    "ea.yield_10y": "IRLTLT01EZM156N",
    "ea.cpi_index": "CP0000EZ19M086NEST",
  }).map(([indicator, series]) => ({
    indicator,
    series,
    provider: "FRED",
    url: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series}`,
    dateColumn: "observation_date",
    valueColumn: series,
    divisor: 1,
  })),
  ...Object.entries({
    "us.fed_assets": "WALCL",
    "us.fed_treasuries": "TREAST",
    "us.fed_mbs": "WSHOMCB",
  }).map(([indicator, series]) => ({
    indicator,
    series,
    provider: "FRED",
    url: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series}`,
    dateColumn: "observation_date",
    valueColumn: series,
    divisor: 1,
    format: "weekly" as const,
    minDate: "1900-01-01",
    includeCurrentMonth: true,
  })),
  ...Object.entries({ cn: "41408", jp: "42609", ea: "16713" }).map(
    ([region, code]) => ({
      indicator: region + ".us_treasury_holdings_total",
      provider: "U.S. Treasury TIC",
      series: "Table 3 / " + code,
      url: "https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents/slt_table3.txt",
      dateColumn: "date",
      valueColumn: "for_treas_pos",
      divisor: 1000,
      format: "tic" as const,
      select: { country_code: code },
      filters: {
        country: (
          {
            cn: "China, Mainland",
            jp: "Japan",
            ea: "Memo: Euro Area",
          } as Record<string, string>
        )[region],
      },
    }),
  ),
  {
    indicator: "ea.m2_level",
    series: "BSI.M.U2.Y.V.M20.X.1.U2.2300.Z01.E",
    provider: "ECB",
    url: "https://data-api.ecb.europa.eu/service/data/BSI/M.U2.Y.V.M20.X.1.U2.2300.Z01.E?format=csvdata",
    dateColumn: "TIME_PERIOD",
    valueColumn: "OBS_VALUE",
    divisor: 1000,
    filters: {
      KEY: "BSI.M.U2.Y.V.M20.X.1.U2.2300.Z01.E",
      FREQ: "M",
      UNIT: "EUR",
      UNIT_MULT: "6",
      BS_ITEM: "M20",
      DATA_TYPE: "1",
    },
  },
  {
    indicator: "de.m2_level",
    series: "BBBK10.M.TXI302",
    provider: "Bundesbank",
    url: "https://api.statistiken.bundesbank.de/rest/data/BBBK10/M.TXI302?format=csv",
    dateColumn: "",
    valueColumn: "BBBK10.M.TXI302",
    divisor: 1000,
    metadata: {
      Dimension: "Millionen",
      Einheit: "EURO",
      "Format der Zeitangabe": "P1M",
    },
  },
  ...["LPMVQWK", "LPMVWYW"].map((series, n) => ({
    indicator: n ? "uk.m2_emu_alternative" : "uk.m2_level",
    series,
    provider: "BoE",
    url: `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/1970&Dateto=${new Date().getUTCDate()}/${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][new Date().getUTCMonth()]}/${new Date().getUTCFullYear()}&SeriesCodes=LPMVQWK,LPMVWYW&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`,
    dateColumn: "DATE",
    valueColumn: series,
    divisor: 1000,
  })),
  ...Object.entries({ cn: "CHN", uk: "GBR", de: "DEU" }).map(
    ([region, code]) => ({
      indicator: region + ".inflation_yoy",
      provider: "OECD",
      series: code + ".CPI.GY",
      url: `https://sdmx.oecd.org/public/rest/v1/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0/${code}.M.N.CPI.PA._T.N.GY?startPeriod=1970-01&format=csvfile`,
      dateColumn: "TIME_PERIOD",
      valueColumn: "OBS_VALUE",
      divisor: 1,
      filters: {
        REF_AREA: code,
        FREQ: "M",
        METHODOLOGY: "N",
        MEASURE: "CPI",
        UNIT_MEASURE: "PA",
        EXPENDITURE: "_T",
        ADJUSTMENT: "N",
        TRANSFORMATION: "GY",
      },
    }),
  ),
];
export function parseSource(text: string, spec: RefreshSpec, ref: string) {
  if (spec.format === "tic") {
    if (
      !text.includes(
        "Table 3: U.S. Treasury Securities Held by Foreign Residents",
      ) ||
      !text.includes("Millions of dollars")
    )
      throw new Error("TIC表名或单位变化，保留原数据。");
    const lines = text.split(/\r?\n/);
    const start = lines.findIndex((line) =>
      line.startsWith("country\tcountry_code\tdate\tfor_treas_pos\t"),
    );
    if (start < 0) throw new Error("TIC字段变化，保留原数据。");
    text = lines.slice(start).join("\n");
  }
  const rows = csvRows(text);
  const header = rows.shift() || [];
  let di = header.indexOf(spec.dateColumn);
  if (di < 0 && spec.provider === "FRED") di = header.indexOf("DATE");
  const vi = header.indexOf(spec.valueColumn);
  if (
    di < 0 ||
    vi < 0 ||
    header.filter((h) => h === spec.valueColumn).length !== 1
  )
    throw new Error("来源字段发生变化，旧数据已保留。");
  if (spec.metadata)
    for (const [key, value] of Object.entries(spec.metadata)) {
      if (!rows.some((r) => r[0] === key && r[1] === value))
        throw new Error("来源单位或频率发生变化，旧数据已保留。");
    }
  const filters = Object.entries(spec.filters || {}).map(([key, value]) => {
    const index = header.indexOf(key);
    if (index < 0) throw new Error("来源缺少统计口径字段。");
    return { index, value };
  });
  const selectors = Object.entries(spec.select || {}).map(([key, value]) => ({
    index: header.indexOf(key),
    value,
  }));
  if (selectors.some((f) => f.index < 0)) throw new Error("缺少来源筛选字段。");
  const points: Point[] = [];
  const weekly = new Map<string, { date: string; point: Point }>();
  const nativeSeen = new Set<string>();
  const currentMonth = new Date().toISOString().slice(0, 7);
  for (const row of rows) {
    if (selectors.some((f) => row[f.index] !== f.value)) continue;
    if (spec.provider === "Bundesbank" && !/^\d{4}-\d{2}$/.test(row[di]))
      continue;
    if (filters.some((f) => row[f.index] !== f.value))
      throw new Error("来源统计口径与指标不符，旧数据已保留。");
    if (
      spec.provider === "OECD" &&
      !["", "0"].includes(row[header.indexOf("UNIT_MULT")] || "")
    )
      throw new Error("来源单位倍率不符。");
    if (!row[vi] || row[vi] === "." || row[vi] === "NA") continue;
    let date = row[di]?.slice(0, 7) + "-01";
    if (spec.provider === "BoE") {
      const m = row[di].match(/^\d{1,2} ([A-Za-z]{3}) (\d{4})$/);
      const mon = m
        ? [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
          ].indexOf(m[1])
        : -1;
      if (!m || mon < 0) throw new Error("来源月份无法识别。");
      date = m[2] + "-" + String(mon + 1).padStart(2, "0") + "-01";
    }
    if (
      date < (spec.minDate || "1970-01-01") ||
      (spec.includeCurrentMonth
        ? date.slice(0, 7) > currentMonth
        : date.slice(0, 7) >= currentMonth)
    )
      continue;
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(row[vi].trim()))
      throw new Error("来源包含无效数值，旧数据已保留。");
    const value = Number(row[vi]) / spec.divisor;
    if (!Number.isFinite(value))
      throw new Error("来源包含无效数值，旧数据已保留。");
    if (spec.format === "weekly") {
      const nativeDate = row[di];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nativeDate) || nativeSeen.has(nativeDate))
        throw new Error("周度来源日期无效或重复。");
      nativeSeen.add(nativeDate);
      if (!weekly.has(date) || weekly.get(date)!.date < nativeDate)
        weekly.set(date, { date: nativeDate, point: [date, value, ref] });
    } else points.push([date, value, ref]);
  }
  return validatePoints(
    spec.format === "weekly"
      ? [...weekly.values()].map((p) => p.point)
      : points,
  );
}
export function derive(data: Dataset) {
  for (const region of data.regions) {
    const rid = region.id;
    const cpi = data.observations[rid + ".cpi_index"];
    if (cpi && (rid === "us" || rid === "ea")) {
      const m = new Map(cpi.map((p) => [p[0], p[1]]));
      const id = rid + ".inflation_yoy";
      const ref = "derived_" + id;
      data.sources[ref] = {
        id: ref,
        series_id: id,
        provider: "平台计算",
        source_url: "",
        urls: [],
        original_notes: "同月价格指数与前一年同月比值减一，乘100。",
      };
      const preserved = (data.observations[id] || []).filter(
        (p) =>
          p[0] < `${Number(cpi[0][0].slice(0, 4)) + 1}${cpi[0][0].slice(4)}`,
      );
      data.observations[id] = [
        ...preserved,
        ...cpi.flatMap((p) => {
          const prev = m.get(`${Number(p[0].slice(0, 4)) - 1}${p[0].slice(4)}`);
          return prev ? [[p[0], 100 * (p[1] / prev - 1), ref] as Point] : [];
        }),
      ];
    }
    for (const tenor of ["10y", "20y"]) {
      const id = rid + ".real_" + tenor + "_proxy";
      if (!data.indicators.some((i) => i.id === id)) continue;
      const yields = data.observations[rid + ".yield_" + tenor] || [];
      const inf = new Map(
        (data.observations[rid + ".inflation_yoy"] || []).map((p) => [
          p[0],
          p[1],
        ]),
      );
      const ref = "derived_" + id;
      data.sources[ref] = {
        id: ref,
        series_id: id,
        provider: "平台计算",
        source_url: "",
        urls: [],
        original_notes:
          "名义利率减去同月总体CPI/HICP同比；不代表预期实际收益率。",
      };
      data.observations[id] = yields
        .filter((p) => inf.has(p[0]))
        .map((p) => [p[0], p[1] - inf.get(p[0])!, ref]);
    }
  }
  const currentEA = "ea.real_10y_ecb_changing_proxy";
  if (data.indicators.some((i) => i.id === currentEA)) {
    const yields = data.observations["ea.yield_10y_ecb_changing"] || [];
    const prices = new Map(
      (data.observations["ea.inflation_yoy_ecb_changing"] || []).map((p) => [
        p[0],
        p[1],
      ]),
    );
    const ref = "derived_" + currentEA;
    data.sources[ref] = {
      id: ref,
      series_id: currentEA,
      provider: "平台计算",
      source_url: "",
      urls: [],
      original_notes: "ECB U2同月10年名义收益率减总体HICP同比，变动成员口径。",
    };
    data.observations[currentEA] = yields
      .filter((p) => prices.has(p[0]))
      .map((p) => [p[0], p[1] - prices.get(p[0])!, ref]);
  }
  for (const i of data.indicators) {
    const pts = data.observations[i.id];
    if (pts?.length) {
      i.coverage = {
        ...i.coverage,
        start: pts[0][0],
        end: pts.at(-1)![0],
        count: pts.length,
      };
      i.source = Array.from(new Set(pts.map((p) => p[2])));
    }
  }
  return data;
}
export async function fetchSource(spec: RefreshSpec) {
  if (spec.format?.startsWith("gold-"))
    return fetchGoldSource(spec as GoldRefreshSpec);
  const response = await fetch(spec.url, {
    signal: AbortSignal.timeout(20000),
    headers: { Accept: "text/csv" },
  });
  if (!response.ok)
    throw new Error(`上游返回 ${response.status}，旧数据已保留。`);
  const text = await response.text();
  if (text.length > 12_000_000) throw new Error("来源文件过大，待人工检查。");
  const ref = "live_" + spec.indicator;
  const sourceDates: Record<string, string> = {};
  if (spec.format === "weekly") {
    const rows = csvRows(text);
    const header = rows.shift()!;
    const di =
      header.indexOf("observation_date") >= 0
        ? header.indexOf("observation_date")
        : header.indexOf("DATE");
    const vi = header.indexOf(spec.valueColumn);
    for (const row of rows)
      if (row[vi] && row[vi] !== ".") {
        const month = row[di].slice(0, 7) + "-01";
        if (!sourceDates[month] || sourceDates[month] < row[di])
          sourceDates[month] = row[di];
      }
  }
  return { text, ref, points: parseSource(text, spec, ref), sourceDates };
}
export function mergeSource(
  data: Dataset,
  spec: RefreshSpec,
  points: Point[],
  ref: string,
) {
  const old = data.observations[spec.indicator] || [];
  if (points.length < Math.min(12, old.length))
    throw new Error("来源有效数据不足，旧数据已保留。");
  if (old.length && points.at(-1)![0] < old.at(-1)![0])
    throw new Error("上游最新观测期落后于已有数据，旧数据已保留。");
  const m = new Map(old.map((p) => [p[0], p]));
  points.forEach((p) => m.set(p[0], p));
  data.observations[spec.indicator] = [...m.values()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  data.sources[ref] = {
    id: ref,
    series_id: spec.series,
    provider: spec.provider,
    source_url: spec.url,
    urls: [spec.url],
    original_notes: `校验获取时间：${new Date().toISOString()}；原始缺失不补零。`,
  };
  return data;
}
