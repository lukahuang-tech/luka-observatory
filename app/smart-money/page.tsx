import { requireChatGPTUser } from "@/app/chatgpt-auth";
import SmartMoney from "./smart-money";
export const metadata = {
  title: "聪明钱观察 · 观测",
  description: "机构 13F 季度持仓、共同持仓与标的反查",
};
export default async function SmartMoneyPage() {
  await requireChatGPTUser("/smart-money");
  return <SmartMoney />;
}
