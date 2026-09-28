import { env } from "cloudflare:workers";
export function database() {
  if (!env.DB) throw new Error("数据存储暂不可用，请稍后重试。");
  return env.DB;
}
export function bucket() {
  if (!env.BUCKET) throw new Error("文件存储暂不可用，请稍后重试。");
  return env.BUCKET;
}
export function config() {
  return env as unknown as Record<string, string>;
}
