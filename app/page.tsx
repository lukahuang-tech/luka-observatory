import seed from "@/data/seed.json";
import Dashboard from "./dashboard";
import type { Dataset } from "@/lib/model";
import { requireChatGPTUser } from "./chatgpt-auth";
import { readSnapshot } from "@/lib/storage";
export default async function Home() {
  await requireChatGPTUser("/");
  try {
    const snapshot = await readSnapshot();
    return (
      <Dashboard initial={snapshot.data} initialRevision={snapshot.revision} />
    );
  } catch {
    return (
      <Dashboard
        initial={seed as unknown as Dataset}
        initialError="存储暂不可用，当前展示初始只读快照。请稍后重新加载。"
      />
    );
  }
}
