import { database, bucket } from "@/db";
import seed from "@/data/smart-money-seed";
import type { SmartData } from "./smart-money";
export type SmartSnapshot = {
  data: SmartData;
  revision: number;
  updatedAt: string;
};
async function initialData(): Promise<SmartData> {
  const bytes = Uint8Array.from(atob(seed), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}
export async function readSmartSnapshot(): Promise<SmartSnapshot> {
  const row = await database()
    .prepare(
      "SELECT revision, object_key, updated_at FROM workspace WHERE id = ?",
    )
    .bind("smart-money")
    .first<{ revision: number; object_key: string; updated_at: string }>();
  if (!row) {
    const data = await initialData();
    return { data, revision: 0, updatedAt: data.generatedAt };
  }
  const object = await bucket().get(row.object_key);
  if (!object) throw new Error("13F持仓快照暂时无法读取，请重试。");
  return {
    data: await object.json<SmartData>(),
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}
export async function saveSmartSnapshot(data: SmartData, expected: number) {
  const key = `smart-money/snapshots/${crypto.randomUUID()}.json`,
    at = new Date().toISOString();
  await bucket().put(key, JSON.stringify(data), {
    httpMetadata: { contentType: "application/json" },
  });
  const result = await database()
    .prepare(
      "INSERT INTO workspace (id,revision,object_key,updated_at) SELECT 'smart-money',1,?,? WHERE ? = 0 OR EXISTS (SELECT 1 FROM workspace WHERE id = 'smart-money') ON CONFLICT(id) DO UPDATE SET revision=workspace.revision+1,object_key=excluded.object_key,updated_at=excluded.updated_at WHERE workspace.revision = ?",
    )
    .bind(key, at, expected, expected)
    .run();
  if (!result.meta.changes) {
    await bucket().delete(key);
    throw new Error("数据已由另一个操作更新，请重新加载后再提交。");
  }
  return expected + 1;
}
