import { authorize, json, failure } from "@/lib/http";
import {
  parseSmartImport,
  mergeSmartData,
  smartPeriods,
} from "@/lib/smart-money";
import {
  readSmartSnapshot,
  saveSmartSnapshot,
} from "@/lib/smart-money-storage";
import { recordRun } from "@/lib/storage";
export async function GET(request: Request) {
  try {
    const { owner } = await authorize(request);
    return json({ ...(await readSmartSnapshot()), owner });
  } catch (e) {
    return failure(e);
  }
}
async function limitedText(request: Request) {
  const max = 25_000_000;
  if (Number(request.headers.get("content-length")) > max)
    throw new Error("单次文件最大 25 MB。");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("没有文件内容。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Error("单次文件最大 25 MB。");
    }
    chunks.push(value);
  }
  return new Blob(chunks as BlobPart[]).text();
}
export async function POST(request: Request) {
  try {
    await authorize(request, true);
    const revision = Number(request.headers.get("x-snapshot-revision"));
    if (
      !request.headers.has("x-snapshot-revision") ||
      !Number.isSafeInteger(revision) ||
      revision < 0
    )
      throw new Error("缺少快照版本，请重新加载。");
    const incoming = parseSmartImport(await limitedText(request));
    const snap = await readSmartSnapshot();
    if (revision !== snap.revision)
      throw new Error("数据已由另一个操作更新，请重新加载后再提交。");
    const data = mergeSmartData(snap.data, incoming);
    const summary = {
      institutions: incoming.fundOrder.length,
      quarters: Object.values(incoming.funds).reduce(
        (n, f) => n + f.quarters.length,
        0,
      ),
      periods: smartPeriods(incoming),
      generatedAt: incoming.generatedAt,
      overlaps: Object.values(incoming.funds).reduce(
        (n, f) =>
          n +
          f.quarters.filter((q) =>
            snap.data.funds[f.key]?.quarters.some((p) => p.period === q.period),
          ).length,
        0,
      ),
      retained: Object.values(incoming.funds).reduce(
        (n, f) =>
          n +
          f.quarters.filter(
            (q) =>
              data.funds[f.key].quarters.find((p) => p.period === q.period) !==
              q,
          ).length,
        0,
      ),
      totalQuarters: Object.values(data.funds).reduce(
        (n, f) => n + f.quarters.length,
        0,
      ),
    };
    if (request.headers.get("x-import-commit") !== "true")
      return json({ summary, revision });
    const next = await saveSmartSnapshot(data, revision);
    await recordRun("smart-money-import", "succeeded", summary);
    return json({ revision: next, summary });
  } catch (e) {
    return failure(e);
  }
}
