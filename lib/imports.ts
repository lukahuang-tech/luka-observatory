import { z } from "zod";
import type { Dataset, Indicator, Point } from "./model";
export function csvRows(text: string): string[][] {
  if (text.trim().startsWith("<"))
    throw new Error("来源返回了网页，未更新数据。");
  const first = text.split(/\r?\n/)[0];
  const delimiter = first.includes("\t")
    ? "\t"
    : first.includes(";")
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quote && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quote = !quote;
    } else if (
      (c === "," || c === ";" || c === "\t") &&
      !quote &&
      c === delimiter
    ) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quote) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quote) throw new Error("CSV 引号未闭合。");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  return rows;
}
const pointSchema = z.tuple([
  z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/),
  z.number().finite(),
  z.string().min(1),
]);
export function validatePoints(points: Point[]) {
  if (!points.length) throw new Error("没有有效观测，旧数据已保留。");
  const seen = new Set<string>();
  for (const p of points) {
    pointSchema.parse(p);
    if (seen.has(p[0])) throw new Error(`存在重复月份 ${p[0]}，请先处理冲突。`);
    seen.add(p[0]);
  }
  return points.sort((a, b) => a[0].localeCompare(b[0]));
}
export function validateBackup(value: unknown): Dataset {
  const root = z
    .object({
      schema_version: z.union([z.string(), z.number()]),
      as_of: z.string(),
      spaces: z
        .array(
          z
            .object({
              id: z.string().min(1),
              title: z.string().min(1),
              description: z.string(),
              default_indicator_ids: z.array(z.string()),
              indicator_ids: z.array(z.string()),
            })
            .passthrough(),
        )
        .max(200),
      indicators: z
        .array(
          z
            .object({
              id: z.string().min(1),
              space_id: z.string(),
              title: z.string(),
              short_title: z.string(),
              variable: z.string(),
              region: z.string(),
              region_name: z.string(),
              unit: z.string(),
              display_unit: z.string(),
              display_divisor: z.number().positive(),
              display_precision: z.number(),
              frequency: z.enum(["M", "A"]),
              frequency_name: z.string(),
              role: z.string(),
              source: z.array(z.string()),
              provider: z.array(z.string()),
              definition: z.string(),
              breaks: z.array(
                z
                  .object({
                    date: z.string().optional(),
                    start: z.string().optional(),
                    end: z.string().optional(),
                    description: z.string(),
                  })
                  .passthrough(),
              ),
              coverage: z
                .object({
                  start: z.string(),
                  end: z.string(),
                  count: z.number(),
                })
                .passthrough(),
              comparability_note: z.string(),
              tags: z.array(z.string()),
            })
            .passthrough(),
        )
        .max(1000),
      regions: z.array(
        z.object({ id: z.string(), title: z.string() }).passthrough(),
      ),
      sources: z.record(
        z
          .object({
            id: z.string(),
            series_id: z.string(),
            provider: z.string(),
            source_url: z.string(),
            urls: z.array(z.string()),
          })
          .passthrough(),
      ),
      observations: z.record(z.array(pointSchema)),
    })
    .passthrough()
    .parse(value) as unknown as Dataset;
  if (!["1", "1.0", "1.0.0"].includes(String(root.schema_version)))
    throw new Error("不支持此备份版本，请先迁移。");
  const ids = new Set(root.indicators.map((i) => i.id));
  const spaces = new Set(root.spaces.map((s) => s.id));
  if (ids.size !== root.indicators.length || spaces.size !== root.spaces.length)
    throw new Error("指标或空间 ID 重复。");
  for (const s of root.spaces)
    if (
      [...s.indicator_ids, ...s.default_indicator_ids].some(
        (id) => !ids.has(id),
      )
    )
      throw new Error("空间引用了不存在的指标。");
  for (const i of root.indicators) {
    if (!spaces.has(i.space_id)) throw new Error("指标所属空间不存在。");
    const pts = root.observations[i.id];
    if (!pts) throw new Error("指标缺少观测。");
    validatePoints(pts);
    if (pts.some((p) => !root.sources[p[2]]))
      throw new Error("观测缺少来源记录。");
    if (i.source.some((s) => !root.sources[s]))
      throw new Error("指标缺少来源元数据。");
  }
  return root;
}
export const importSchema = z.object({
  spaceId: z.string(),
  name: z.string().min(1).max(100),
  unit: z.string().min(1).max(80),
  region: z.string().min(1).max(80),
  frequency: z.enum(["M", "A"]),
  sourceUrl: z.string().max(1000),
  definition: z.string().max(3000),
  dateColumn: z.string(),
  valueColumn: z.string(),
  csv: z.string().max(2_000_000),
  filename: z.string().max(200),
});
export function parseImport(
  input: z.infer<typeof importSchema>,
  sourceRef: string,
) {
  const rows = csvRows(input.csv);
  const head = rows.shift() || [];
  const di = head.indexOf(input.dateColumn),
    vi = head.indexOf(input.valueColumn);
  if (di < 0 || vi < 0 || di === vi)
    throw new Error("请选择不同的日期列和数值列。");
  const points: Point[] = [];
  let missing = 0;
  for (const row of rows) {
    const raw = row[di]?.trim();
    const value = row[vi]?.trim();
    if (!raw) throw new Error("存在空日期。");
    if (!value || value === "." || value === "NA") {
      missing++;
      continue;
    }
    let date = "";
    if (input.frequency === "M" && /^\d{4}-(0[1-9]|1[0-2])(-01)?$/.test(raw))
      date = raw.slice(0, 7) + "-01";
    else if (input.frequency === "A" && /^\d{4}(-01-01)?$/.test(raw))
      date = raw.slice(0, 4) + "-01-01";
    else
      throw new Error(`日期格式不正确：${raw}。月度用 YYYY-MM，年度用 YYYY。`);
    const num = Number(value);
    if (!Number.isFinite(num)) throw new Error(`无法识别数值：${value}`);
    points.push([date, num, sourceRef]);
  }
  return { points: validatePoints(points), missing };
}
export function importedIndicator(
  id: string,
  sourceRef: string,
  input: z.infer<typeof importSchema>,
  points: Point[],
): Indicator {
  return {
    id,
    space_id: input.spaceId,
    title: `${input.region} · ${input.name}`,
    short_title: input.name,
    variable: "custom",
    region: "custom",
    region_name: input.region,
    unit: input.unit,
    display_unit: input.unit,
    display_divisor: 1,
    display_precision: 2,
    frequency: input.frequency,
    frequency_name: input.frequency === "M" ? "月度" : "年度",
    role: "primary",
    source: [sourceRef],
    provider: ["用户导入"],
    definition: input.definition || "用户定义的观察指标。",
    breaks: [],
    derived_formula: null,
    coverage: {
      start: points[0][0],
      end: points.at(-1)![0],
      count: points.length,
    },
    comparability_note: "用户导入；单位和口径以导入时声明为准。",
    tags: ["用户导入"],
  };
}
