import { z } from "zod";
import { authorize, body, json, failure } from "@/lib/http";
import { readSnapshot, saveSnapshot, recordRun } from "@/lib/storage";
import { bucket, database } from "@/db";
import { refreshSpecs, fetchSource, mergeSource, derive } from "@/lib/refresh";
export async function POST(request: Request) {
  try {
    await authorize(request, true);
    const input = z
      .object({
        ids: z.array(z.string()).max(20),
        dueOnly: z.boolean().optional(),
      })
      .parse(await body(request));
    const specs = refreshSpecs.filter((s) => input.ids.includes(s.indicator));
    if (!specs.length)
      return json({
        results: [],
        message: "所选指标尚无自动适配器，请导入新源文件。",
      });
    const results = [];
    for (const spec of specs) {
      const key = "refresh:" + spec.indicator;
      const last = await database()
        .prepare("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .first<{ value: string }>();
      if (
        input.dueOnly &&
        last &&
        Date.now() - Date.parse(last.value) < 86400000
      ) {
        results.push({
          id: spec.indicator,
          status: "skipped",
          message: "24小时内已检查",
        });
        continue;
      }
      try {
        await database()
          .prepare(
            "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          )
          .bind(key, new Date().toISOString())
          .run();
        const fetched = await fetchSource(spec);
        await bucket().put(
          `raw/${spec.indicator}/${crypto.randomUUID()}.csv`,
          fetched.text,
        );
        let committed = false;
        for (let n = 0; n < 2 && !committed; n++) {
          const snap = await readSnapshot();
          mergeSource(snap.data, spec, fetched.points, fetched.ref);
          derive(snap.data);
          try {
            await saveSnapshot(snap.data, snap.revision);
            committed = true;
          } catch (e) {
            if (n === 1) throw e;
          }
        }
        await database()
          .prepare(
            "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          )
          .bind(key, new Date().toISOString())
          .run();
        results.push({
          id: spec.indicator,
          status: "succeeded",
          latest: fetched.points.at(-1)![0],
          count: fetched.points.length,
        });
      } catch (e) {
        results.push({
          id: spec.indicator,
          status: "failed",
          message:
            e instanceof Error ? e.message : "来源暂不可用，旧数据已保留。",
        });
      }
    }
    await recordRun(
      "refresh",
      results.some((r) => r.status === "failed") ? "partial" : "succeeded",
      results,
    );
    return json({ results });
  } catch (e) {
    return failure(e);
  }
}
