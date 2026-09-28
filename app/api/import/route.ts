import { authorize, body, json, failure } from "@/lib/http";
import { importSchema, parseImport, importedIndicator } from "@/lib/imports";
import { readSnapshot, saveSnapshot, recordRun } from "@/lib/storage";
import { bucket } from "@/db";
export async function POST(request: Request) {
  try {
    await authorize(request, true);
    const raw = await body(request);
    const input = importSchema.parse(raw);
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(input)),
        ),
      ),
    )
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    const id = "custom." + hash.slice(0, 24),
      sourceRef = "import_" + hash.slice(0, 24);
    const parsed = parseImport(input, sourceRef);
    const snap = await readSnapshot();
    if (!snap.data.spaces.some((s) => s.id === input.spaceId))
      throw new Error("找不到目标空间。");
    const exists = snap.data.indicators.some((i) => i.id === id);
    if (!raw.commit)
      return json({
        count: parsed.points.length,
        missing: parsed.missing,
        start: parsed.points[0][0],
        end: parsed.points.at(-1)![0],
        exists,
        preview: parsed.points.slice(0, 8),
        unit: input.unit,
      });
    if (exists) return json({ id, unchanged: true, revision: snap.revision });
    if (raw.revision !== snap.revision)
      throw new Error("数据已由另一个操作更新，请重新加载后再提交。");
    await bucket().put("imports/" + hash + ".csv", input.csv, {
      httpMetadata: { contentType: "text/csv" },
    });
    snap.data.sources[sourceRef] = {
      id: sourceRef,
      series_id: id,
      provider: "用户导入",
      source_url: input.sourceUrl,
      urls: input.sourceUrl ? [input.sourceUrl] : [],
      original_notes: input.definition,
      original_file: {
        key: "imports/" + hash + ".csv",
        filename: input.filename,
        sha256: hash,
      },
    };
    snap.data.indicators.push(
      importedIndicator(id, sourceRef, input, parsed.points),
    );
    snap.data.observations[id] = parsed.points;
    const space = snap.data.spaces.find((s) => s.id === input.spaceId)!;
    space.indicator_ids.push(id);
    space.default_indicator_ids.push(id);
    const revision = await saveSnapshot(snap.data, snap.revision);
    await recordRun("import", "succeeded", {
      name: input.name,
      count: parsed.points.length,
      id,
    });
    return json({ id, revision });
  } catch (e) {
    return failure(e);
  }
}
