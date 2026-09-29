import { authorize, body, json, failure } from "@/lib/http";
import { database } from "@/db";
import { readSnapshot } from "@/lib/storage";
import { viewSchema } from "@/lib/view";
export async function POST(request: Request) {
  try {
    await authorize(request, true);
    const view = viewSchema.parse(await body(request));
    const snap = await readSnapshot();
    if (view.ids.some((id) => !snap.data.indicators.some((i) => i.id === id)))
      throw new Error("指标不存在，请重新选择。");
    await database()
      .prepare(
        "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .bind("composer-view", JSON.stringify(view))
      .run();
    return json({ saved: true });
  } catch (e) {
    return failure(e);
  }
}
