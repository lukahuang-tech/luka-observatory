import { z } from "zod";
import { authorize, body, json, failure } from "@/lib/http";
import { writeSettings } from "@/lib/storage";
export async function POST(request: Request) {
  try {
    await authorize(request, true);
    const settings = z
      .object({
        autoOnOpen: z.boolean(),
        provider: z.enum(["openai-responses", "openai-compatible-chat"]),
        model: z.string().max(100),
        endpoint: z.enum([
          "https://api.openai.com/v1",
          "https://api.deepseek.com/v1",
        ]),
      })
      .parse(await body(request));
    if (
      settings.provider === "openai-responses" &&
      settings.endpoint !== "https://api.openai.com/v1"
    )
      throw new Error("Responses 协议需选择 OpenAI 接口。");
    await writeSettings(settings);
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
