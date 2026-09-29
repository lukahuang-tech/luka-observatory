import {
  Dataset,
  View,
  selectPoints,
  pearson,
  calendar,
  seriesTransform,
  seriesUnit,
} from "./model";
export function researchContext(data: Dataset, view: View, revision: number) {
  const selected = data.indicators.filter((i) => view.ids.includes(i.id));
  const sources = new Set<string>();
  const series = selected.map((i) => {
    const raw = (data.observations[i.id] || []).filter(
      (p) => p[0] >= view.start && p[0] <= view.end,
    );
    raw.forEach((p) => sources.add(p[2]));
    const observed = new Set(raw.map((p) => p[0]));
    const missing =
      i.frequency === "M"
        ? calendar(view.start, view.end).filter((d) => !observed.has(d))
        : [];
    return {
      ...i,
      observations: raw,
      originalObservationDates:
        (
          data.observation_source_dates as Record<string, unknown> | undefined
        )?.[i.id] || null,
      displayed: selectPoints(data, i.id, view),
      selectedTransform: seriesTransform(i, view),
      displayedUnit: seriesUnit(i, view),
      missingPeriods: missing,
    };
  });
  const pairs = [];
  for (let a = 0; a < series.length; a++)
    for (let b = a + 1; b < series.length; b++) {
      const left = series[a].displayed;
      const right = new Map(series[b].displayed.map((p) => [p.date, p]));
      const paired = left.filter(
        (p) =>
          right.has(p.date) &&
          (view.frequency === "M" ||
            ((series[a].frequency === "A" || p.n === 12) &&
              (series[b].frequency === "A" || right.get(p.date)!.n === 12))),
      );
      pairs.push({
        a: series[a].id,
        b: series[b].id,
        method: `Pearson, ${view.frequency}, ${series[a].selectedTransform}/${series[b].selectedTransform}, 年度仅完整12个月`,
        n: paired.length,
        start: paired[0]?.date || null,
        end: paired.at(-1)?.date || null,
        r: pearson(
          paired.map((p) => p.value),
          paired.map((p) => right.get(p.date)!.value),
        ),
      });
    }
  return {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    snapshotRevision: revision,
    initialAsOf: data.as_of,
    selection: view,
    series,
    sources: [...sources].map((id) => data.sources[id]),
    statistics: pairs,
    methodology: [
      "原始 observations 的单位为 unit；displayed 使用 display_unit 和 display_divisor，或选定变换。",
      "实际利率近似值是同月名义利率减总体CPI/HICP同比，不是未来10年实际利率，也不是持有期收益。",
      "缺口不插值。年度为有效月算术均值，n为月数；相关性排除不完整年。",
      "货币余额水平随时间增长，水平相关可能是共同趋势，不解释因果；口径断点须结合指标说明判断。",
    ],
    externalResearch: false,
  };
}
