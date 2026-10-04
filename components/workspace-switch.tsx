"use client";
import { ChartNoAxesCombined, Landmark } from "lucide-react";
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
  active: "data" | "smart-money";
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
    </nav>
  );
}
