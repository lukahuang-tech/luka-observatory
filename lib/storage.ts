import seed from "@/data/seed.json";
import { database, bucket } from "@/db";
import type { Dataset } from "./model";
export type Snapshot = { data: Dataset; revision: number; updatedAt: string };
export async function readSnapshot(): Promise<Snapshot> {
  const row = await database()
    .prepare(
      "SELECT revision, object_key, updated_at FROM workspace WHERE id = ?",
    )
    .bind("main")
    .first<{ revision: number; object_key: string; updated_at: string }>();
  if (!row)
    return {
      data: structuredClone(seed) as unknown as Dataset,
      revision: 0,
      updatedAt: seed.as_of,
    };
  const object = await bucket().get(row.object_key);
  if (!object) throw new Error("当前快照无法读取，请稍后重试。");
  return {
    data: await object.json<Dataset>(),
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}
export async function saveSnapshot(data: Dataset, expected: number) {
  const key = `snapshots/${crypto.randomUUID()}.json`;
  const at = new Date().toISOString();
  await bucket().put(key, JSON.stringify(data), {
    httpMetadata: { contentType: "application/json" },
  });
  const result = await database()
    .prepare(
      `INSERT INTO workspace (id, revision, object_key, updated_at) SELECT 'main', 1, ?, ? WHERE ? = 0 OR EXISTS (SELECT 1 FROM workspace WHERE id = 'main') ON CONFLICT(id) DO UPDATE SET revision = workspace.revision + 1, object_key = excluded.object_key, updated_at = excluded.updated_at WHERE workspace.revision = ?`,
    )
    .bind(key, at, expected, expected)
    .run();
  if (!result.meta.changes) {
    await bucket().delete(key);
    throw new Error("数据已由另一个操作更新，请重新加载后再提交。");
  }
  return expected + 1;
}
export async function recordRun(
  kind: string,
  status: string,
  summary: unknown,
) {
  await database()
    .prepare(
      "INSERT INTO runs (id,kind,status,summary,created_at) VALUES (?,?,?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      kind,
      status,
      JSON.stringify(summary),
      new Date().toISOString(),
    )
    .run();
}
export async function readSettings() {
  const row = await database()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .bind("preferences")
    .first<{ value: string }>();
  return row
    ? JSON.parse(row.value)
    : {
        autoOnOpen: true,
        provider: "openai-responses",
        model: "",
        endpoint: "https://api.openai.com/v1",
      };
}
export async function writeSettings(value: unknown) {
  await database()
    .prepare(
      "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .bind("preferences", JSON.stringify(value))
    .run();
}
