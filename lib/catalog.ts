import expansion from "@/data/catalog-expansion.json";
import { Dataset, calendar } from "./model";
const RELEASE = "2026-09-reserves-and-balance-sheets-v2";
/** Additive catalog upgrade. Existing observations and all personal content win. */
export function applyCatalogRelease(original: Dataset): Dataset {
  const applied = Array.isArray(original.applied_catalog_releases)
    ? (original.applied_catalog_releases as string[])
    : [];
  if (applied.includes(RELEASE)) return original;
  const data = structuredClone(original);
  const extra = expansion as unknown as Dataset;
  for (const source of Object.values(extra.sources)) {
    if (!data.sources[source.id])
      data.sources[source.id] = structuredClone(source);
  }
  for (const region of extra.regions)
    if (!data.regions.some((r) => r.id === region.id))
      data.regions.push(structuredClone(region));
  for (const ind of extra.indicators) {
    if (!data.indicators.some((i) => i.id === ind.id))
      data.indicators.push(structuredClone(ind));
    const old = data.observations[ind.id] || [];
    const points = new Map(
      (extra.observations[ind.id] || []).map((p) => [p[0], p]),
    );
    old.forEach((p) => points.set(p[0], p));
    data.observations[ind.id] = [...points.values()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
  }
  for (const space of extra.spaces) {
    const existing = data.spaces.find((s) => s.id === space.id);
    if (existing)
      existing.indicator_ids = [
        ...new Set([...existing.indicator_ids, ...space.indicator_ids]),
      ];
    else data.spaces.push(structuredClone(space));
  }
  for (const ind of data.indicators) {
    const points = data.observations[ind.id] || [];
    if (!points.length) continue;
    const start = points[0][0],
      end = points.at(-1)![0],
      dates = new Set(points.map((p) => p[0]));
    ind.coverage = {
      start,
      end,
      count: points.length,
      missing_months:
        ind.frequency === "M"
          ? calendar(start, end).filter((d) => !dates.has(d))
          : [],
    };
    ind.source = [...new Set(points.map((p) => p[2]))];
  }
  for (const key of [
    "observation_source_dates",
    "native_observation_metadata",
  ]) {
    data[key] = {
      ...((extra[key] as object) || {}),
      ...((data[key] as object) || {}),
    };
  }
  // Make retired geography explicit without changing its historical values.
  for (const id of ["ea.yield_10y", "ea.real_10y_proxy"]) {
    const ind = data.indicators.find((i) => i.id === id);
    if (ind && !ind.title.includes("19国")) ind.title += "（旧19国口径）";
  }
  const replacements: Record<string, string> = {
    "ea.inflation_yoy": "ea.inflation_yoy_ecb_changing",
    "ea.yield_10y": "ea.yield_10y_ecb_changing",
    "ea.real_10y_proxy": "ea.real_10y_ecb_changing_proxy",
  };
  for (const space of data.spaces.filter((s) =>
    ["sovereign-rates", "inflation"].includes(s.id),
  ))
    space.default_indicator_ids = space.default_indicator_ids.map(
      (id) => replacements[id] || id,
    );
  data.disclosure_status = extra.disclosure_status;
  data.applied_catalog_releases = [...applied, RELEASE];
  data.catalog_as_of = extra.as_of;
  return data;
}
