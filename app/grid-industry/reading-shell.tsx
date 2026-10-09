"use client";

import type { CSSProperties, ReactNode } from "react";
import { ChartNoAxesCombined, BookOpen, LockKeyhole } from "lucide-react";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarInset, SidebarTrigger, SidebarMenu, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { WorkspaceSwitch, WorkspaceMenuButton } from "@/components/workspace-switch";

export type ReadingLink = { id: string; text: string };

export default function ReadingShell({ chapters, categories, categoryLabel, children }: {
  chapters: ReadingLink[];
  categories: ReadingLink[];
  categoryLabel: string;
  children: ReactNode;
}) {
  return (
    <SidebarProvider className="oil-workspace grid-workspace" style={{ "--sidebar-width": "224px" } as CSSProperties}>
      <a className="oil-skip" href="#reading-top">跳到正文</a>
      <Sidebar>
        <SidebarHeader>
          <div className="brand"><span className="brand-mark"><ChartNoAxesCombined size={21} /></span>观测</div>
        </SidebarHeader>
        <SidebarContent className="px-4">
          <WorkspaceSwitch active="grid-industry" />
          <nav aria-label="电力与电网产业链阅读目录">
            <div className="nav-section mt-3">阅读目录</div>
            <SidebarMenu>
              {chapters.map((chapter) => (
                <SidebarMenuItem key={chapter.id}>
                  <WorkspaceMenuButton asChild className="oil-nav-link">
                    <a href={`#${chapter.id}`}>{chapter.text.replace(/^[一二三四五六七八九十]+、/, "")}</a>
                  </WorkspaceMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
            {categoryLabel && <div className="nav-section mt-3">{categoryLabel}</div>}
            <SidebarMenu>
              {categories.map((category) => (
                <SidebarMenuItem key={category.id}>
                  <WorkspaceMenuButton asChild className="oil-nav-link oil-nav-category">
                    <a href={`#${category.id}`}>{category.text}</a>
                  </WorkspaceMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarContent>
        <SidebarFooter className="p-5">
          <div className="oil-private"><LockKeyhole size={15} />个人研究空间</div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="workspace-top oil-top">
          <div className="flex items-center gap-3"><SidebarTrigger /><span>电力与电网产业链 <span className="oil-divider">/</span> 完整阅读版</span></div>
          <a className="oil-top-link" href="#reading-top" aria-label="回到开篇"><BookOpen size={16} /><span>回到开篇</span></a>
        </header>
        <main className="workspace-main oil-main">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
