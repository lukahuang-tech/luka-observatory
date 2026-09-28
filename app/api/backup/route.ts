import { authorize, body, json, failure } from "@/lib/http";
import { readSnapshot, saveSnapshot, recordRun } from "@/lib/storage";
import { validateBackup } from "@/lib/imports";
export async function GET(request: Request) {
  try {
    await authorize(request);
    const snap = await readSnapshot();
    return new Response(
      JSON.stringify({
        format: "observatory-backup-v1",
        exportedAt: new Date().toISOString(),
        ...snap,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition":
            'attachment; filename="observatory-backup.json"',
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    await authorize(request, true);
    const input = await body(request);
    if (input.confirm !== "RESTORE") throw new Error("请明确确认恢复备份。");
    const data = validateBackup(input.backup?.data);
    const snap = await readSnapshot();
    if (input.revision !== snap.revision)
      throw new Error("数据已由另一个操作更新，请重新加载后再提交。");
    const revision = await saveSnapshot(data, snap.revision);
    await recordRun("restore", "succeeded", {
      indicators: data.indicators.length,
    });
    return json({ revision });
  } catch (e) {
    return failure(e);
  }
}
