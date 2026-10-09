"use client";
import { ChartNoAxesCombined, Landmark, Droplets, Zap } from "lucide-react";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";

export function WorkspaceMenuButton(
  props: React.ComponentProps<typeof SidebarMenuButton>,
) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuButton
      {...props}
      onClick={(e) => {
        props.onClick?.(e);
        if (!e.defaultPrevented) setOpenMobile(false);
      }}
    />
  );
}

export function WorkspaceSwitch({
  active,
}: {
  active: "data" | "smart-money" | "oil-industry" | "grid-industry";
}) {
  return (
    <nav className="workspace-switch" aria-label="观察分类">
      <a href="/" aria-current={active === "data" ? "page" : undefined}>
        <ChartNoAxesCombined size={17} />
        <span>数据观察</span>
      </a>
      <a
        href="/smart-money"
        aria-current={active === "smart-money" ? "page" : undefined}
      >
        <Landmark size={17} />
        <span>金融机构13F持仓披露</span>
      </a>
      <a
        href="/oil-industry"
        aria-current={active === "oil-industry" ? "page" : undefined}
      >
        <Droplets size={17} />
        <span>石油产业链</span>
      </a>
      <a
        href="/grid-industry"
        aria-current={active === "grid-industry" ? "page" : undefined}
      >
        <Zap size={17} />
        <span>电力与电网产业链</span>
      </a>
    </nav>
  );
}
