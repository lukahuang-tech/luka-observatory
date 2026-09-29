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
        const rawKey = `raw/${spec.indicator}/${crypto.randomUUID()}.txt`;
        await bucket().put(rawKey, fetched.text);
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(fetched.text),
        );
        const sha256 = [...new Uint8Array(digest)]
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("");
        let committed = false;
        for (let n = 0; n < 2 && !committed; n++) {
          const snap = await readSnapshot();
          mergeSource(snap.data, spec, fetched.points, fetched.ref);
          if ("sourceURL" in fetched) {
            snap.data.sources[fetched.ref].source_url = fetched.sourceURL;
            snap.data.sources[fetched.ref].urls = fetched.provenance.map(
              (p) => p.url,
            );
          }
          snap.data.sources[fetched.ref].original_file = {
            key: rawKey,
            filename: spec.indicator + "-source.txt",
            sha256,
          };
          if (
            "sourceDates" in fetched &&
            fetched.sourceDates &&
            Object.keys(fetched.sourceDates).length
          ) {
            const dates = (snap.data.observation_source_dates || {}) as Record<
              string,
              Record<string, string>
            >;
            dates[spec.indicator] = {
              ...dates[spec.indicator],
              ...fetched.sourceDates,
            };
            snap.data.observation_source_dates = dates;
          }
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
            e instanceof Error
              ? /internal error/i.test(e.message)
                ? "来源连接失败，已保留上次有效数据。"
                : /abort|timeout/i.test(e.message)
                  ? "来源响应超时，已保留上次有效数据。"
                  : e.message
              : "来源暂不可用，旧数据已保留。",
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
