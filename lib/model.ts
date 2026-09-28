export type Point = [string, number, string];
export type Source = {
  original_file?: { key: string; filename: string; sha256: string };
  id: string;
  series_id: string;
  provider: string;
  distributor?: string;
  source_url: string;
  urls: string[];
  original_notes?: string;
  observation_start?: string;
  observation_end?: string;
};
export type Indicator = {
  id: string;
  space_id: string;
  title: string;
  short_title: string;
  variable: string;
  region: string;
  region_name: string;
  unit: string;
  display_unit: string;
  display_divisor: number;
  display_precision: number;
  frequency: string;
  frequency_name: string;
  role: string;
  source: string[];
  provider: string[];
  definition: string;
  breaks: {
    date?: string;
    start?: string;
    end?: string;
    description: string;
    kind?: string;
  }[];
  derived_formula: unknown;
  coverage: {
    start: string;
    end: string;
    count: number;
    missing_months?: string[];
  };
  comparability_note: string;
  tags: string[];
};
export type Space = {
  id: string;
  title: string;
  description: string;
  default_indicator_ids: string[];
  indicator_ids: string[];
};
export type Dataset = {
  schema_version: string | number;
  as_of: string;
  spaces: Space[];
  regions: { id: string; title: string; source_name?: string }[];
  indicators: Indicator[];
  sources: Record<string, Source>;
  observations: Record<string, Point[]>;
  [key: string]: unknown;
};
export type View = {
  space: string;
  ids: string[];
  start: string;
  end: string;
  frequency: "M" | "A";
  transform: "level" | "index" | "yoy";
};
export const palette = [
  "#276acf",
  "#359b8f",
  "#9273b0",
  "#cf8f43",
  "#d66e7a",
  "#5a94b1",
  "#748092",
];
export function calendar(start: string, end: string) {
  const rows: string[] = [];
  let [y, m] = start.slice(0, 7).split("-").map(Number);
  const stop = end.slice(0, 7);
  for (let n = 0; n < 1500; n++) {
    const s = `${y}-${String(m).padStart(2, "0")}`;
    if (s > stop) break;
    rows.push(s + "-01");
    if (++m === 13) {
      m = 1;
      y++;
    }
  }
  return rows;
}
export function selectPoints(
  data: Dataset,
  id: string,
  view: View,
): { date: string; value: number; n: number }[] {
  const ind = data.indicators.find((i) => i.id === id);
  if (!ind) return [];
  const raw = data.observations[id] || [];
  const values = new Map(raw.map((p) => [p[0], p[1]]));
  const result = raw
    .filter((p) => p[0] >= view.start && p[0] <= view.end)
    .map((p) => ({ date: p[0], value: p[1], n: 1 }));
  const transformed = result
    .map((p) => {
      let v: number | null = p.value / ind.display_divisor;
      if (view.transform === "yoy") {
        const prev = `${Number(p.date.slice(0, 4)) - 1}${p.date.slice(4)}`;
        const base = values.get(prev);
        const crosses = ind.breaks.some(
          (b) =>
            b.kind !== "gap" &&
            (b.date || b.start || "").slice(0, 7) > prev.slice(0, 7) &&
            (b.date || b.start || "").slice(0, 7) <= p.date.slice(0, 7),
        );
        v =
          base !== undefined && base !== 0 && !crosses
            ? 100 * (p.value / base - 1)
            : null;
      }
      return { ...p, value: v };
    })
    .filter((p) => p.value !== null) as {
    date: string;
    value: number;
    n: number;
  }[];
  if (view.transform === "index") {
    const base = transformed[0]?.value;
    if (!base) return [];
    transformed.forEach((p) => (p.value = (p.value / base) * 100));
  }
  if (view.frequency === "M" || ind.frequency === "A") return transformed;
  const groups = new Map<string, { sum: number; n: number }>();
  transformed.forEach((p) => {
    const y = p.date.slice(0, 4);
    const g = groups.get(y) || { sum: 0, n: 0 };
    g.sum += p.value;
    g.n++;
    groups.set(y, g);
  });
  return [...groups].map(([y, g]) => ({
    date: y + "-01-01",
    value: g.sum / g.n,
    n: g.n,
  }));
}
export function chartRows(data: Dataset, view: View) {
  const series = view.ids.map(
    (id) => [id, selectPoints(data, id, view)] as const,
  );
  let dates = calendar(view.start, view.end);
  if (view.frequency === "A") dates = dates.filter((d) => d.endsWith("-01-01"));
  return dates.map((date) => {
    const row: Record<string, string | number | null> = { date };
    for (const [id, points] of series) {
      row[id] = points.find((p) => p.date === date)?.value ?? null;
    }
    return row;
  });
}
export function pearson(a: number[], b: number[]) {
  if (a.length < 3) return null;
  const ma = a.reduce((x, y) => x + y, 0) / a.length,
    mb = b.reduce((x, y) => x + y, 0) / b.length;
  let xy = 0,
    xx = 0,
    yy = 0;
  for (let i = 0; i < a.length; i++) {
    xy += (a[i] - ma) * (b[i] - mb);
    xx += (a[i] - ma) ** 2;
    yy += (b[i] - mb) ** 2;
  }
  return xx && yy ? xy / Math.sqrt(xx * yy) : null;
}
