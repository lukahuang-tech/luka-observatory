import { authorize, json, failure } from "@/lib/http";
import { readSnapshot, readSettings } from "@/lib/storage";
import { database, config } from "@/db";
import { refreshSpecs } from "@/lib/refresh";
export async function GET(request: Request) {
  try {
    const { owner, user } = await authorize(request);
    const [snapshot, settings, runs] = await Promise.all([
      readSnapshot(),
      readSettings(),
      database()
        .prepare("SELECT * FROM runs ORDER BY created_at DESC LIMIT 20")
        .all(),
    ]);
    const savedView = await database()
      .prepare("SELECT value FROM settings WHERE key = ?")
      .bind("composer-view")
      .first<{ value: string }>();
    return json({
      ...snapshot,
      owner,
      savedView: savedView ? JSON.parse(savedView.value) : null,
      user: { name: user.displayName },
      settings: {
        ...settings,
        configured: Boolean(
          settings.provider === "openai-responses"
            ? config().OPENAI_API_KEY
            : config().AI_API_KEY,
        ),
      },
      runs: runs.results,
      refreshable: refreshSpecs.map((s) => s.indicator),
    });
  } catch (e) {
    return failure(e);
  }
}
