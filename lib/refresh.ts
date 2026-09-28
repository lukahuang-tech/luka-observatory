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
};
export const refreshSpecs: RefreshSpec[] = [
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
  const points: Point[] = [];
  const currentMonth = new Date().toISOString().slice(0, 7);
  for (const row of rows) {
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
    if (date < "1970-01-01" || date.slice(0, 7) >= currentMonth) continue;
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(row[vi].trim()))
      throw new Error("来源包含无效数值，旧数据已保留。");
    const value = Number(row[vi]) / spec.divisor;
    if (!Number.isFinite(value))
      throw new Error("来源包含无效数值，旧数据已保留。");
    points.push([date, value, ref]);
  }
  return validatePoints(points);
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
  const response = await fetch(spec.url, {
    signal: AbortSignal.timeout(20000),
    headers: { Accept: "text/csv" },
  });
  if (!response.ok)
    throw new Error(`上游返回 ${response.status}，旧数据已保留。`);
  const text = await response.text();
  if (text.length > 12_000_000) throw new Error("来源文件过大，待人工检查。");
  const ref = "live_" + spec.indicator;
  return { text, ref, points: parseSource(text, spec, ref) };
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
