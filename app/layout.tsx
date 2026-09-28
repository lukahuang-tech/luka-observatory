import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "观测 · 个人量化研究",
  description: "你的数据，独立的观察空间，持续的研究。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
