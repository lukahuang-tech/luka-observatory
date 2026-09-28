import { z } from "zod";
import { authorize, body, json, failure } from "@/lib/http";
import { readSnapshot, saveSnapshot } from "@/lib/storage";
export async function POST(request: Request) {
  try {
    await authorize(request, true);
    const input = z
      .object({
        title: z.string().trim().min(1).max(60),
        description: z.string().max(500),
        revision: z.number().int().nonnegative(),
      })
      .parse(await body(request));
    const snap = await readSnapshot();
    if (snap.revision !== input.revision)
      throw new Error("数据已由另一个操作更新，请重新加载后再提交。");
    const id = "space-" + crypto.randomUUID();
    const space = {
      id,
      title: input.title,
      description: input.description,
      indicator_ids: [],
      default_indicator_ids: [],
    };
    snap.data.spaces.push(space);
    const revision = await saveSnapshot(snap.data, snap.revision);
    return json({ space, revision });
  } catch (e) {
    return failure(e);
  }
}
