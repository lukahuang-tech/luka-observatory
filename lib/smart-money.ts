import { z } from "zod";

const str = z.string().max(2000);
const num = z.number().finite();
const date = z.string().regex(/^\d{4}-(03-31|06-30|09-30|12-31)$/);
const holdingSchema = z
  .object({
    issuer: str,
    class: str,
    cusip: z.string().min(1).max(30),
    ticker: str.default(""),
    value: num.nonnegative(),
    shares: num.nonnegative(),
    weight: num.nonnegative(),
    shareType: str.default(""),
    putCall: str.default(""),
    action: z.enum(["new", "add", "reduce", "exit", "flat", "base"]),
    prevShares: num.nonnegative().optional(),
    prevValue: num.nonnegative().optional(),
    shareDelta: num.optional(),
    valueDelta: num.optional(),
    voteSole: num.nonnegative().optional(),
    voteShared: num.nonnegative().optional(),
    voteNone: num.nonnegative().optional(),
  })
  .passthrough();
const quarterSchema = z
  .object({
    period: date,
    filingDate: str,
    accession: str,
    totalValue: num.nonnegative(),
    holdingsCount: num.int().nonnegative(),
    holdings: z.array(holdingSchema).max(50000),
    exits: z.array(holdingSchema).max(50000).default([]),
    sourceUrl: str.default(""),
    actions: z.record(num.int().nonnegative()).optional(),
    isTrimmed: z.boolean().default(false),
    rawValueUnit: str.optional(),
    status: str.optional(),
  })
  .passthrough();
const fundSchema = z
  .object({
    key: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    nameZh: str,
    nameEn: str,
    cik: z.string().regex(/^\d{1,10}$/),
    style: str.default(""),
    person: str.default(""),
    status: str,
    updatedAt: z
      .union([z.literal(""), z.string().datetime({ offset: true })])
      .optional(),
    quarters: z.array(quarterSchema).max(400),
    error: str.optional(),
    refreshError: str.optional(),
  })
  .passthrough();
const schema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    fundOrder: z.array(z.string()).min(1).max(200),
    defaultKeys: z.array(z.string()).max(200),
    source: str,
    funds: z.record(fundSchema),
  })
  .passthrough();
export type Holding = z.infer<typeof holdingSchema>;
export type Quarter = z.infer<typeof quarterSchema>;
export type Fund = z.infer<typeof fundSchema>;
export type SmartData = z.infer<typeof schema>;
export const smartMethod =
  "来自原 13F 工作台的历史快照；金额沿用原脚本的美元换算，尚未逐份重核 XML 与修订报告。同季统计只纳入所选报告期、无 Put/Call 标记且 shareType 为 SH 的记录。大型机构可能只保留前 500 笔；共同持仓和搜索均只覆盖已保存记录。动作沿用原快照的持股数比较，不等于交易金额；疑似不完整基期和不连续季度暂停动作统计。";
export const secGuide =
  "https://www.sec.gov/rules-regulations/staff-guidance/frequently-asked-questions-about-form-13f";

export function validateSmartData(input: unknown): SmartData {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error(
      "13F 数据格式不完整或含有无效数值：" +
        result.error.issues[0]?.path.join("."),
    );
  const d = result.data;
  if (
    Object.keys(d.funds).length > 200 ||
    new Set(d.fundOrder).size !== d.fundOrder.length ||
    d.fundOrder.length !== Object.keys(d.funds).length ||
    d.fundOrder.some((k) => !d.funds[k] || d.funds[k].key !== k) ||
    d.defaultKeys.some((k) => !d.funds[k])
  )
    throw new Error("机构目录与数据不一致。");
  for (const f of Object.values(d.funds)) {
    if (new Set(f.quarters.map((q) => q.period)).size !== f.quarters.length)
      throw new Error("同一机构存在重复季度。");
    for (const q of f.quarters) {
      if (q.status !== "missing" && !safeSecUrl(q.sourceUrl))
        throw new Error("有效季度必须提供 SEC 原始申报链接。");
      if (q.status === "missing" && q.holdings.length)
        throw new Error("失败季度不能含有有效持仓记录。");
      if (q.holdings.length > q.holdingsCount)
        throw new Error("持仓记录数超过申报数量。");
      const keys = q.holdings.map((h) => securityKey(h));
      if (new Set(keys).size !== keys.length)
        throw new Error("同一季度存在重复证券记录，请先按证券类型核对。");
    }
  }
  if (!Object.values(d.funds).some((f) => f.quarters.length))
    throw new Error("文件中没有可导入的季度数据。");
  return d;
}
export function parseSmartImport(text: string): SmartData {
  let raw = text.trim();
  if (raw.startsWith("<")) {
    const start = "/*__13F_DATA_START__*/",
      end = "/*__13F_DATA_END__*/";
    const from = raw.indexOf(start),
      to = raw.indexOf(end, from + start.length);
    if (from < 0 || to < 0)
      throw new Error(
        "HTML 中未找到 13F 数据标记，请选择原工作台的 index.html。",
      );
    raw = raw.slice(from + start.length, to);
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("无法读取 JSON；只接受原工作台 HTML 或 13F JSON 数据。");
  }
  return validateSmartData(
    value?.format === "observatory-smart-money-v1" ? value.data : value,
  );
}
export function mergeSmartData(
  current: SmartData,
  incoming: SmartData,
): SmartData {
  const funds = { ...current.funds };
  for (const [key, f] of Object.entries(incoming.funds)) {
    const previous = funds[key];
    if (
      previous &&
      previous.cik.replace(/^0+/, "") !== f.cik.replace(/^0+/, "")
    )
      throw new Error("机构标识对应的 CIK 已改变，请核对后导入。");
    const quarters = new Map(
      (previous?.quarters || []).map((q) => [q.period, q]),
    );
    const incomingTime = Date.parse(f.updatedAt || incoming.generatedAt);
    const previousTime = Date.parse(previous?.updatedAt || current.generatedAt);
    for (const q of f.quarters) {
      const old = quarters.get(q.period);
      if (old && old.status !== "missing") {
        if (
          q.status === "missing" ||
          q.filingDate < old.filingDate ||
          (q.filingDate === old.filingDate && incomingTime < previousTime)
        )
          continue;
      }
      quarters.set(q.period, q);
    }
    const metadata = previous && incomingTime < previousTime ? previous : f;
    funds[key] = {
      ...previous,
      ...metadata,
      quarters: [...quarters.values()].sort((a, b) =>
        b.period.localeCompare(a.period),
      ),
    };
    if (metadata === f && !f.refreshError) delete funds[key].refreshError;
    if (previous && metadata === f && f.status !== "ok") {
      funds[key] = {
        ...previous,
        quarters: funds[key].quarters,
        refreshError: f.error || "最近更新失败，保留原有有效数据。",
        lastAttemptAt: f.updatedAt || incoming.generatedAt,
      };
    }
    if (
      f.quarters.some((q) => q.status === "missing") &&
      incomingTime >= previousTime
    )
      funds[key].refreshError = "部分季度读取失败；已保留原有有效持仓。";
  }
  return {
    ...current,
    ...incoming,
    funds,
    fundOrder: [...new Set([...current.fundOrder, ...incoming.fundOrder])],
    defaultKeys: [
      ...new Set([...current.defaultKeys, ...incoming.defaultKeys]),
    ],
    generatedAt:
      new Date(incoming.generatedAt) > new Date(current.generatedAt)
        ? incoming.generatedAt
        : current.generatedAt,
  };
}
export function smartPeriods(d: SmartData) {
  return [
    ...new Set(
      Object.values(d.funds).flatMap((f) => f.quarters.map((q) => q.period)),
    ),
  ]
    .sort()
    .reverse();
}
export function exactQuarter(f: Fund, period: string) {
  return f.quarters.find((q) => q.period === period && q.status !== "missing");
}
export function equityRecord(h: Holding) {
  return !h.putCall.trim() && h.shareType.trim().toUpperCase() === "SH";
}
export function securityKey(h: Holding) {
  return [
    h.cusip.trim().toUpperCase(),
    h.putCall.trim().toUpperCase(),
    h.shareType.trim().toUpperCase(),
  ].join("|");
}
function quarterIndex(period: string) {
  return (
    Number(period.slice(0, 4)) * 4 + Math.ceil(Number(period.slice(5, 7)) / 3)
  );
}
export function quarterTimeline(f: Fund) {
  if (!f.quarters.length) return [];
  const indices = f.quarters.map((q) => quarterIndex(q.period));
  const map = new Map(f.quarters.map((q) => [quarterIndex(q.period), q]));
  const rows: { period: string; value: number | null }[] = [];
  for (let i = Math.min(...indices); i <= Math.max(...indices); i++) {
    const q = map.get(i),
      year = Math.floor((i - 1) / 4),
      quarter = ((i - 1) % 4) + 1;
    rows.push({
      period: `${year} Q${quarter}`,
      value: q && q.status !== "missing" ? q.totalValue : null,
    });
  }
  return rows;
}
export function comparisonIssue(f: Fund, q: Quarter): string | null {
  const previous = f.quarters
    .filter((x) => x.period < q.period && x.status !== "missing")
    .sort((a, b) => b.period.localeCompare(a.period))[0];
  if (!previous) return "缺少上一期，动作未经交叉核验";
  if (quarterIndex(q.period) - quarterIndex(previous.period) !== 1)
    return "季度不连续，暂停环比动作统计";
  const ratio = q.holdingsCount / Math.max(previous.holdingsCount, 1);
  if (ratio > 5 || ratio < 0.2) return "前后期持仓数量异常变化，动作待复核";
  return null;
}
export function currentQuarters(d: SmartData, period: string) {
  return d.fundOrder.flatMap((k) => {
    const fund = d.funds[k],
      q = exactQuarter(fund, period);
    return q ? [{ fund, q }] : [];
  });
}
export function actionResolver(f: Fund, q: Quarter) {
  const issue = comparisonIssue(f, q);
  const prev = f.quarters
    .filter((x) => x.period < q.period && x.status !== "missing")
    .sort((a, b) => b.period.localeCompare(a.period))[0];
  const previous = new Map(
    (prev?.holdings || []).map((h) => [securityKey(h), h]),
  );
  const previousCusips = new Set((prev?.holdings || []).map((h) => h.cusip));
  return (h: Holding): string => {
    if (h.action === "base") return "base";
    if (issue || !equityRecord(h)) return "unverified";
    const p = previous.get(securityKey(h));
    if (!p && (previousCusips.has(h.cusip) || prev?.isTrimmed))
      return "unverified";
    if (p && Math.abs(p.shares - (h.prevShares ?? -1)) > 0.01)
      return "unverified";
    return h.action;
  };
}
export type Aggregate = {
  id: string;
  ticker: string;
  cusip: string;
  issuer: string;
  totalValue: number;
  adds: number;
  reduces: number;
  funds: {
    key: string;
    name: string;
    value: number;
    weight: number;
    action: string;
    shares: number;
  }[];
};
export function aggregateSmart(d: SmartData, period: string): Aggregate[] {
  const map = new Map<string, Aggregate>();
  for (const { fund, q } of currentQuarters(d, period)) {
    const resolveAction = actionResolver(fund, q);
    for (const h of q.holdings.filter(equityRecord)) {
      const id = securityKey(h);
      const a = map.get(id) || {
        id,
        ticker: h.ticker,
        cusip: h.cusip,
        issuer: h.issuer,
        totalValue: 0,
        adds: 0,
        reduces: 0,
        funds: [],
      };
      a.ticker ||= h.ticker;
      a.totalValue += h.value;
      const action = resolveAction(h);
      a.adds += action === "add" ? 1 : 0;
      a.reduces += action === "reduce" ? 1 : 0;
      a.funds.push({
        key: fund.key,
        name: fund.nameZh,
        value: h.value,
        weight: h.weight,
        action,
        shares: h.shares,
      });
      map.set(id, a);
    }
  }
  return [...map.values()].sort((a, b) => b.totalValue - a.totalValue);
}
export const actionName = (s: string) =>
  ({
    new: "新进",
    add: "加仓",
    reduce: "减仓",
    exit: "清仓",
    flat: "持平",
    base: "基期",
    unverified: "待复核",
  })[s] || s;
export const quarterLabel = (s: string) =>
  s ? `${s.slice(0, 4)} Q${Math.ceil(Number(s.slice(5, 7)) / 3)}` : "—";
export function money(n: number) {
  const a = Math.abs(n);
  return a >= 1e12
    ? `${(n / 1e12).toFixed(2)} 万亿美元`
    : a >= 1e8
      ? `${(n / 1e8).toFixed(2)} 亿美元`
      : a >= 1e4
        ? `${(n / 1e4).toFixed(2)} 万美元`
        : `$${n.toLocaleString("en-US")}`;
}
export function safeSecUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === "https:" &&
      (u.hostname === "www.sec.gov" || u.hostname === "sec.gov")
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function smartResearchContext(
  d: SmartData,
  period: string,
  revision: number,
) {
  return {
    format: "observatory-smart-money-context-v1",
    revision,
    period,
    generatedAt: d.generatedAt,
    source: d.source,
    method: smartMethod,
    secGuide,
    unit: "USD",
    scope: "各机构所选季度前 10 笔；共同持仓前 20 项；不代表全量持仓",
    missingFunds: d.fundOrder
      .filter((k) => !exactQuarter(d.funds[k], period))
      .map((k) => d.funds[k].nameZh),
    institutions: currentQuarters(d, period).map(({ fund, q }) => ({
      key: fund.key,
      name: fund.nameZh,
      cik: fund.cik,
      period: q.period,
      sourceUrl: q.sourceUrl,
      filingDate: q.filingDate,
      accession: q.accession,
      totalValue: q.totalValue,
      holdingsCount: q.holdingsCount,
      savedCount: q.holdings.length,
      isTrimmed: q.isTrimmed,
      comparisonIssue: comparisonIssue(fund, q),
      topHoldings: q.holdings
        .slice(0, 10)
        .map((h) => ({
          issuer: h.issuer,
          ticker: h.ticker,
          cusip: h.cusip,
          value: h.value,
          weight: h.weight,
          shares: h.shares,
          putCall: h.putCall,
          shareType: h.shareType,
          action: actionResolver(fund, q)(h),
        })),
    })),
    common: aggregateSmart(d, period)
      .filter((a) => a.funds.length >= 3)
      .slice(0, 20),
  };
}
