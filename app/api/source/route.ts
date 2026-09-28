import { authorize, json, failure } from "@/lib/http";
import { readSnapshot } from "@/lib/storage";
import { bucket } from "@/db";
export async function GET(request: Request) {
  try {
    await authorize(request);
    const id = new URL(request.url).searchParams.get("id") || "";
    const snap = await readSnapshot();
    const source = snap.data.sources[id];
    if (!source?.original_file) throw new Error("此来源没有上传文件。");
    const object = await bucket().get(source.original_file.key);
    if (!object) throw new Error("源文件暂时不可用。");
    return new Response(object.body, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="source-${id}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
