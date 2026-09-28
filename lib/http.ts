import { getChatGPTUser } from "@/app/chatgpt-auth";
import { config } from "@/db";
export async function authorize(request: Request, write = false) {
  const user = await getChatGPTUser();
  if (!user) throw new Error("请先登录。");
  const owner =
    Boolean(config().OWNER_EMAIL) &&
    user.email.toLowerCase() === config().OWNER_EMAIL.toLowerCase();
  if (write && !owner) throw new Error("只有空间所有者可以执行此操作。");
  if (write) {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin)
      throw new Error("请求来源验证失败，请重新打开页面。");
  }
  return { user, owner };
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export function failure(error: unknown) {
  const msg = error instanceof Error ? error.message : "操作失败，请稍后重试。";
  const status = msg.includes("登录")
    ? 401
    : msg.includes("所有者") || msg.includes("来源验证")
      ? 403
      : msg.includes("另一个操作")
        ? 409
        : 400;
  return json({ error: msg }, status);
}
export async function body(request: Request, max = 8_000_000) {
  const text = await request.text();
  if (text.length > max)
    throw new Error("文件过大，请分批导入（单次最多 8 MB）。");
  return JSON.parse(text);
}
