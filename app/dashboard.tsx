"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  ChartNoAxesCombined,
  LayoutGrid,
  TrendingUp,
  Activity,
  Layers3,
  Plus,
  ArrowUpRight,
  Download,
  Sparkles,
  Settings2,
  Database,
  LockKeyhole,
  RefreshCw,
  SlidersHorizontal,
  FileText,
  ExternalLink,
  Upload,
  Info,
} from "lucide-react";
import {
  Dataset,
  View,
  Indicator,
  Transform,
  seriesTransform,
  seriesUnit,
  chartRows,
  palette,
  selectPoints,
} from "@/lib/model";
import { researchContext } from "@/lib/research";
import {
  WorkspaceSwitch,
  WorkspaceMenuButton as SidebarMenuButton,
} from "@/components/workspace-switch";
import {
  AiPanel,
  Choice,
  ImportPanel,
  IndicatorPanel,
  Modal,
  SettingsPanel,
  SpacePanel,
  api,
  download,
} from "./panels";
const initialView: View = {
  space: "sovereign-rates",
  ids: ["us.yield_10y", "us.m2_level"],
  start: "2000-01-01",
  end: new Date().getFullYear() + "-12-01",
  frequency: "M",
  transform: "level",
};
function safeLink(s: string) {
  try {
    const url = new URL(s);
    return ["http:", "https:"].includes(url.protocol) ? s : undefined;
  } catch {
    return undefined;
  }
}
export default function Dashboard({
  initial,
  initialRevision = 0,
  initialError = "",
}: {
  initial: Dataset;
  initialRevision?: number;
  initialError?: string;
}) {
  const [data, setData] = useState(initial);
  const [space, setSpace] = useState("overview");
  const [view, setView] = useState<View>(initialView);
  const [revision, setRevision] = useState(initialRevision);
  const [owner, setOwner] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [refreshable, setRefreshable] = useState<string[]>([]);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<string | null>(null);
  const [detail, setDetail] = useState<Indicator | null>(null);
  const [chartTab, setChartTab] = useState("chart");
  const autoDone = useRef(false);
  const restoredView = useRef(false);
  const views = useRef<Record<string, View>>({});
  const load = useCallback(async () => {
    try {
      const r = await api("/api/data");
      setData(r.data);
      if (!restoredView.current) {
        restoredView.current = true;
        if (r.savedView) {
          const saved = {
            ...r.savedView,
            ids: r.savedView.ids.filter((id: string) =>
              r.data.indicators.some((i: Indicator) => i.id === id),
            ),
          };
          setView(saved);
          views.current.overview = saved;
        }
      }
      setRevision(r.revision);
      setOwner(r.owner);
      setSettings(r.settings);
      setRuns(r.runs);
      setRefreshable(r.refreshable);
      setError("");
      return r;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, []);
  async function refresh(ids: string[], dueOnly = false) {
    if (refreshing) return;
    setRefreshing(true);
    setError("");
    let success = 0,
      failed = 0,
      skipped = 0;
    try {
      for (let i = 0; i < ids.length; i += 3) {
        const r = await api("/api/refresh", {
          ids: ids.slice(i, i + 3),
          dueOnly,
        });
        success += (r.results || []).filter(
          (x: any) => x.status === "succeeded",
        ).length;
        failed += (r.results || []).filter(
          (x: any) => x.status === "failed",
        ).length;
        skipped += (r.results || []).filter(
          (x: any) => x.status === "skipped",
        ).length;
      }
      await load();
      setNotice(
        failed
          ? `${success} 个来源更新完成，${failed} 个来源暂不可用，已保留旧数据。`
          : success
            ? `已检查 ${success} 个来源。最新观测期请查看各指标。`
            : skipped
              ? "24 小时内已检查，继续使用当前快照。"
              : "所选指标需通过源文件更新。",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }
  useEffect(() => {
    void load().then((r) => {
      if (r?.owner && r.settings.autoOnOpen && !autoDone.current) {
        autoDone.current = true;
        void refresh(r.refreshable, true);
      }
    });
  }, []);
  useEffect(() => {
    const d = document as Document & {
      modelContext?: { registerTool: (t: unknown, o: unknown) => void };
    };
    if (!d.modelContext) return;
    const life = new AbortController();
    try {
      d.modelContext.registerTool(
        {
          name: "read_observation_context",
          title: "读取当前研究数据",
          description:
            "Read selected observations, units, sources and computed statistics. Does not call a model.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: (input: any) => {
            if (
              !input ||
              typeof input !== "object" ||
              Object.keys(input).length
            )
              throw new Error("Input must be an empty object.");
            return researchContext(data, view, revision);
          },
        },
        { signal: life.signal },
      );
    } catch {
      /* Unsupported experimental API does not affect the product. */
    }
    return () => life.abort();
  }, [data, view, revision]);
  const current =
    data.spaces.find((s) => s.id === view.space) || data.spaces[0];
  const main = view.ids
    .map((id) => data.indicators.find((i) => i.id === id))
    .filter(Boolean) as Indicator[];
  const rows = useMemo(() => chartRows(data, view), [data, view]);
  const research = useMemo(
    () => researchContext(data, view, revision),
    [data, view, revision],
  );
  function go(id: string) {
    views.current[space] = view;
    setSpace(id);
    setChartTab("chart");
    if (views.current[id]) {
      setView(views.current[id]);
      return;
    }
    if (id === "overview") {
      setView(initialView);
      return;
    }
    const s = data.spaces.find((x) => x.id === id);
    if (s)
      setView((v) => ({
        ...v,
        space: id,
        ids: s.default_indicator_ids.slice(0, 8),
        transform: "level",
        seriesOptions: {},
        frequency:
          s.indicator_ids.length &&
          data.indicators.find((i) => i.id === s.indicator_ids[0])
            ?.frequency === "A"
            ? "A"
            : "M",
      }));
  }
  function chooseVariable(variable: string) {
    const ids = current.indicator_ids.filter(
      (id) => data.indicators.find((i) => i.id === id)?.variable === variable,
    );
    const preferred = ids.filter(
      (id) =>
        !(
          ["ea.yield_10y", "ea.real_10y_proxy"].includes(id) &&
          ids.some((x) => x.includes("ecb_changing"))
        ),
    );
    setView((v) => ({
      ...v,
      ids: preferred,
      transform: "level",
      seriesOptions: {},
    }));
  }
  const isSystem = ["data", "settings"].includes(space);
  const unitGroups: Indicator[][] = [];
  for (const ind of main) {
    const key = seriesUnit(ind, view);
    const group = unitGroups.find((g) => seriesUnit(g[0], view) === key);
    if (group) group.push(ind);
    else unitGroups.push([ind]);
  }
  const groups =
    unitGroups.length <= 2 ? (main.length ? [main] : []) : unitGroups;
  const earliest =
    main
      .map((i) => i.coverage.start)
      .filter(Boolean)
      .sort()[0] || "1970-01-01";
  function exportCSV() {
    const lines = [
      "date,indicator_id,title,value,unit,frequency,source_id,source_url",
    ];
    for (const i of main)
      for (const p of data.observations[i.id] || []) {
        if (p[0] < view.start || p[0] > view.end) continue;
        lines.push(
          [
            p[0],
            i.id,
            i.title,
            p[1],
            i.unit,
            i.frequency,
            p[2],
            data.sources[p[2]]?.source_url || "",
          ]
            .map((v) => '"' + String(v).replace(/"/g, '""') + '"')
            .join(","),
        );
      }
    download(
      "observations.csv",
      "\uFEFF" + lines.join("\r\n"),
      "text/csv;charset=utf-8",
    );
  }
  const saveDone = async () => {
    await load();
    setModal(null);
    setNotice("已保存到你的研究空间。");
  };
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "224px" } as React.CSSProperties}
    >
      <Sidebar>
        <SidebarHeader>
          <div className="brand">
            <span className="brand-mark">
              <ChartNoAxesCombined size={21} />
            </span>
            观测
          </div>
        </SidebarHeader>
        <SidebarContent className="px-4">
          <WorkspaceSwitch active="data" />
          <div className="nav-section mt-3">数据观察</div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="nav-item"
                isActive={space === "overview"}
                onClick={() => go("overview")}
              >
                <LayoutGrid />
                自由组合
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="nav-section mt-7">观察空间</div>
          <SidebarMenu>
            {data.spaces.map((s, i) => (
              <SidebarMenuItem key={s.id}>
                <SidebarMenuButton
                  className="nav-item"
                  isActive={space === s.id}
                  onClick={() => go(s.id)}
                >
                  {i === 0 ? (
                    <TrendingUp />
                  ) : i === 1 ? (
                    <Activity />
                  ) : (
                    <Layers3 />
                  )}
                  <span>{s.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <Button
            variant="ghost"
            className="justify-start text-muted-foreground mt-3"
            disabled={!owner}
            onClick={() => setModal("space")}
          >
            <Plus size={16} /> 新建观察空间
          </Button>
          <div className="nav-section mt-9">管理</div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="nav-item"
                isActive={space === "data"}
                onClick={() => go("data")}
              >
                <Database />
                数据与来源
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="nav-item"
                onClick={() => setModal("settings")}
              >
                <Settings2 />
                平台设置
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-5">
          <div className="flex gap-3 items-center border-t pt-5">
            <span className="rounded-full bg-[#e8ebf1] p-2">
              <LockKeyhole size={15} />
            </span>
            <div className="text-sm">
              个人研究空间
              <div className="subtle">
                {owner ? "所有者 · 私人访问" : "受邀访问 · 只读"}
              </div>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="workspace-top">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <span className="text-sm text-[#717a88]">
              数据观察 <span className="px-3 text-[#bdc2ca]">/</span>
              {space === "overview"
                ? "自由组合"
                : space === "data"
                  ? "数据与来源"
                  : current.title}
            </span>
          </div>
          <div className="app-actions">
            <span className="subtle hide-mobile">
              {refreshing ? "正在检查数据…" : `快照版本 ${revision}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModal("ai")}
              disabled={!main.length}
            >
              <Sparkles size={15} /> 智能分析
            </Button>
          </div>
        </header>
        <div className="workspace-main">
          <div className="title-row">
            <div>
              <div className="eyebrow">PERSONAL OBSERVATORY</div>
              <h1>
                {space === "overview"
                  ? "自由组合"
                  : space === "data"
                    ? "数据与来源"
                    : current.title}
              </h1>
              <p>
                {space === "overview"
                  ? "把任意指标放在同一条时间线上。每条数据，保留自己的单位。"
                  : space === "data"
                    ? "每个数值，都保留来处。"
                    : current.description}
              </p>
            </div>
            <div className="app-actions mt-4">
              <Button
                aria-label="添加指标"
                variant="outline"
                onClick={() => setModal("import")}
                disabled={!owner}
              >
                <Plus size={15} />
                <span className="hide-mobile">添加指标</span>
              </Button>
              {!isSystem && (
                <Button
                  aria-label="导出数据"
                  variant="outline"
                  onClick={exportCSV}
                  disabled={!main.length}
                >
                  <Download size={15} />
                  <span className="hide-mobile">导出数据</span>
                </Button>
              )}
            </div>
          </div>
          {error && (
            <div role="alert" className="status-message mb-5">
              {error}{" "}
              <Button variant="link" onClick={() => void load()}>
                重新加载
              </Button>
            </div>
          )}
          {notice && (
            <p role="status" className="text-sm text-[#60758d] mb-4">
              {notice}
            </p>
          )}
          {space === "data" ? (
            <>
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>指标目录</h2>
                    <p className="subtle mt-1">
                      {data.indicators.length} 个指标 · {refreshable.length}{" "}
                      个直接更新来源 · 衍生指标随输入重算
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={!owner || refreshing}
                    onClick={() => refresh(refreshable)}
                  >
                    <RefreshCw
                      size={15}
                      className={refreshing ? "animate-spin" : ""}
                    />
                    {refreshing ? "检查中…" : "检查已接入来源"}
                  </Button>
                </div>
                <div className="px-5 pb-5">
                  <Table className="data-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>指标</TableHead>
                        <TableHead>覆盖范围</TableHead>
                        <TableHead>区间内缺失</TableHead>
                        <TableHead>单位</TableHead>
                        <TableHead>更新方式</TableHead>
                        <TableHead>来源</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.indicators.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell>
                            <button
                              className="text-left hover:text-primary"
                              onClick={() => setDetail(i)}
                            >
                              {i.title}
                            </button>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {i.coverage.start.slice(0, 7)} —{" "}
                            {i.coverage.end.slice(0, 7)}
                          </TableCell>
                          <TableCell>
                            {i.coverage.missing_months?.length
                              ? i.coverage.missing_months.length +
                                " 个月 · 查看口径"
                              : "—"}
                          </TableCell>
                          <TableCell>{i.unit}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {refreshable.includes(i.id)
                              ? "已接入"
                              : i.variable.startsWith("real_") ||
                                  (["us", "ea"].includes(i.region) &&
                                    i.variable === "inflation_yoy")
                                ? "随输入重算"
                                : "源文件导入"}
                          </TableCell>
                          <TableCell className="max-w-52 truncate">
                            {i.provider.join(" / ")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
              <div className="section-row">
                <h2>最近操作</h2>
                <a className="text-sm text-primary" href="/api/backup">
                  下载完整备份
                </a>
              </div>
              <div className="panel p-5">
                {!runs.length ? (
                  <p className="text-sm text-muted-foreground">
                    还没有保存或刷新记录。
                  </p>
                ) : (
                  runs.slice(0, 8).map((r) => (
                    <div key={r.id} className="py-3 border-b last:border-0">
                      <div className="flex justify-between text-sm">
                        <span>
                          {{
                            refresh: "来源检查",
                            import: "文件导入",
                            restore: "恢复备份",
                          }[r.kind as string] || r.kind}
                        </span>
                        <span className="text-muted-foreground">
                          {r.created_at.replace("T", " ").slice(0, 16)} UTC ·{" "}
                          {r.status === "succeeded" ? "完成" : "部分来源失败"}
                        </span>
                      </div>
                      <details className="mini mt-2">
                        <summary className="cursor-pointer">查看记录</summary>
                        <pre className="whitespace-pre-wrap mt-2">
                          {r.summary}
                        </pre>
                      </details>
                    </div>
                  ))
                )}
              </div>
              <p className="footnote">
                “已接入”表示有可用采集适配器；某次网络检查仍可能失败。背景定时任务尚未启用。初始快照采集截至{" "}
                {data.as_of}。
              </p>
            </>
          ) : (
            <>
              {space === "treasury-holdings" && (
                <div className="panel p-5 mb-5">
                  <h2>地区总持仓 · 官方与私人投资者</h2>
                  <p className="text-sm text-muted-foreground mt-2">
                    下方是 TIC 地区合计，不能据此推断央行买卖。欧元区采用 TIC
                    发布的区域合计。
                  </p>
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer">
                      央行单独披露 · 当前可用情况
                    </summary>
                    {(Array.isArray(data.disclosure_status)
                      ? data.disclosure_status
                      : []
                    ).map((item: any) => (
                      <div className="mt-3" key={item.region}>
                        <strong>
                          {item.title} · {item.display_status}
                        </strong>
                        <p className="text-muted-foreground mt-1">
                          {item.reason}
                        </p>
                      </div>
                    ))}
                  </details>
                </div>
              )}
              {space === "gold-reserves" && (
                <p className="status-message mb-5">
                  美国为财政部官方黄金、日本为官方储备。ECB
                  本体与欧元体系分开；月度“黄金条块”只是子项。ECB
                  年报总黄金（含应收款）见独立年度指标，不能与条块历史拼接。
                </p>
              )}
              {space === "fed-balance-sheet" && (
                <p className="status-message mb-5">
                  按每月最后一个已公布周度值展示，当前月为暂值。历史研究整理序列与现行
                  H.4.1 分开选择；总资产包含下方分项，不能相加。
                </p>
              )}
              <div className="metrics">
                {main.slice(0, 3).map((i, n) => {
                  const pts = selectPoints(data, i.id, {
                    ...view,
                    frequency: i.frequency === "A" ? "A" : "M",
                    transform: "level",
                    seriesOptions: {},
                  });
                  const p = pts.at(-1);
                  return (
                    <button
                      className="metric text-left"
                      key={i.id}
                      onClick={() => setDetail(i)}
                    >
                      <div className="metric-label">
                        <span
                          className="dot"
                          style={{ background: palette[n] }}
                        />
                        {i.region_name} · {i.short_title}
                      </div>
                      <div className="metric-value">
                        {p?.value.toFixed(2) ?? "—"}
                        <small>{i.display_unit}</small>
                      </div>
                      <div className="metric-meta">
                        {p?.date.slice(0, i.frequency === "A" ? 4 : 7) ??
                          "无数据"}{" "}
                        · {i.frequency_name}观测
                      </div>
                    </button>
                  );
                })}
              </div>
              <section className="panel chart-panel">
                <div className="panel-head">
                  <div>
                    <h2>
                      {space === "overview"
                        ? "我的组合图表"
                        : current.title + " · 长期趋势"}
                    </h2>
                    <p className="subtle mt-1">
                      {view.start.slice(0, 4)} — {view.end.slice(0, 4)} ·{" "}
                      {view.frequency === "M"
                        ? "月度"
                        : "年度均值（不完整年度保留并标记）"}
                    </p>
                  </div>
                  <div className="app-actions">
                    {space === "overview" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!owner}
                        onClick={async () => {
                          try {
                            await api("/api/view", view);
                            setNotice("组合已保存，下次打开自动恢复。");
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        保存组合
                      </Button>
                    )}
                    <Button
                      aria-label="选择指标"
                      variant="outline"
                      size="sm"
                      onClick={() => setModal("indicators")}
                    >
                      <SlidersHorizontal size={14} />
                      <span className="hide-mobile">选择指标</span>
                    </Button>
                    <Tabs
                      value={view.frequency}
                      onValueChange={(v) =>
                        setView((x) => ({ ...x, frequency: v as "M" | "A" }))
                      }
                    >
                      <TabsList>
                        <TabsTrigger
                          value="M"
                          disabled={main.some((i) => i.frequency === "A")}
                        >
                          月度
                        </TabsTrigger>
                        <TabsTrigger value="A">年度</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>
                {space !== "overview" && current.id === "sovereign-rates" && (
                  <div className="filters pb-3">
                    {[
                      ["yield_10y", "10 年期名义"],
                      ["real_10y_proxy", "10 年期实际近似"],
                      ["yield_20y", "美国 20 年期"],
                      ["tips_10y", "美国 TIPS"],
                    ].map(([v, label]) => (
                      <button
                        key={v}
                        className={
                          "chip " +
                          (main.length && main.every((i) => i.variable === v)
                            ? "active"
                            : "")
                        }
                        onClick={() => chooseVariable(v)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="filters">
                  {["all", "2000", "2010", "2020"].map((y) => (
                    <button
                      key={y}
                      className={
                        "chip " +
                        ((
                          y === "all"
                            ? view.start === earliest
                            : view.start.startsWith(y)
                        )
                          ? "active"
                          : "")
                      }
                      onClick={() =>
                        setView((v) => ({
                          ...v,
                          start: y === "all" ? earliest : y + "-01-01",
                        }))
                      }
                    >
                      {y === "all" ? "全部历史" : y + " 年起"}
                    </button>
                  ))}
                </div>
                <div className="series-controls">
                  {main.map((ind, index) => (
                    <div className="series-control" key={ind.id}>
                      <span
                        className="dot"
                        style={{ background: palette[index % palette.length] }}
                      />
                      <button
                        className="series-title"
                        onClick={() => setDetail(ind)}
                      >
                        {ind.title}
                        <small>
                          {ind.coverage.start.slice(0, 7)} —{" "}
                          {ind.coverage.end.slice(0, 7)}
                        </small>
                      </button>
                      <Choice
                        label={ind.title + "的显示方式"}
                        value={seriesTransform(ind, view)}
                        onChange={(value) =>
                          setView((v) => ({
                            ...v,
                            seriesOptions: {
                              ...v.seriesOptions,
                              [ind.id]: { transform: value as Transform },
                            },
                          }))
                        }
                        items={
                          ind.display_unit === "%"
                            ? [
                                { value: "level", label: "原始值 · %" },
                                { value: "change", label: "同比变化 · 百分点" },
                              ]
                            : [
                                {
                                  value: "level",
                                  label: "原始值 · " + ind.display_unit,
                                },
                                { value: "yoy", label: "同比变化 · %" },
                                { value: "index", label: "起点 = 100" },
                              ]
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={"移除" + ind.title}
                        onClick={() =>
                          setView((v) => ({
                            ...v,
                            ids: v.ids.filter((id) => id !== ind.id),
                          }))
                        }
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                  <p className="mini">
                    {unitGroups.length === 2
                      ? "两种单位分别使用左、右纵轴；双轴高度不能直接比较大小。"
                      : unitGroups.length > 2
                        ? "超过两种单位，按单位分图展示，共享时间范围。"
                        : "相同单位共用纵轴。"}{" "}
                    新加入的指标默认显示原始值。
                  </p>
                </div>
                <div className="filters">
                  <label className="text-sm text-muted-foreground flex gap-2 items-center">
                    开始
                    <input
                      aria-label="开始月份"
                      type="month"
                      value={view.start.slice(0, 7)}
                      min="1800-01"
                      max={view.end.slice(0, 7)}
                      onChange={(e) =>
                        e.target.value &&
                        e.target.value + "-01" <= view.end &&
                        setView((v) => ({
                          ...v,
                          start: e.target.value + "-01",
                        }))
                      }
                      className="input w-36 py-1"
                    />
                  </label>
                  <label className="text-sm text-muted-foreground flex gap-2 items-center">
                    结束
                    <input
                      aria-label="结束月份"
                      type="month"
                      value={view.end.slice(0, 7)}
                      min={view.start.slice(0, 7)}
                      max="2100-12"
                      onChange={(e) =>
                        e.target.value &&
                        e.target.value + "-01" >= view.start &&
                        setView((v) => ({ ...v, end: e.target.value + "-01" }))
                      }
                      className="input w-36 py-1"
                    />
                  </label>
                  <Tabs
                    value={chartTab}
                    onValueChange={setChartTab}
                    className="ml-auto"
                  >
                    <TabsList>
                      <TabsTrigger value="chart">图表</TabsTrigger>
                      <TabsTrigger value="table">数据</TabsTrigger>
                      <TabsTrigger value="stats">相关性</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                {!main.length ? (
                  <div className="empty-area">
                    <Layers3 className="mx-auto mb-4" size={28} />
                    <h2>从第一个指标开始</h2>
                    <p className="text-sm my-3">
                      导入一份数据文件，或选择已有指标进行观察。
                    </p>
                    <Button
                      onClick={() => setModal("import")}
                      disabled={!owner}
                    >
                      <Plus size={15} />
                      添加指标
                    </Button>
                  </div>
                ) : chartTab === "chart" ? (
                  <>
                    {groups.map((group, g) => {
                      const units = [
                        ...new Set(group.map((i) => seriesUnit(i, view))),
                      ];
                      return (
                        <div key={g}>
                          {groups.length > 1 && (
                            <p className="text-sm text-muted-foreground px-7 mt-5">
                              {seriesUnit(group[0], view)}
                            </p>
                          )}
                          <div className="chart-wrap">
                            <ResponsiveContainer
                              width="100%"
                              height="100%"
                              minWidth={0}
                            >
                              <LineChart
                                data={rows}
                                margin={{
                                  left: 0,
                                  right: 15,
                                  top: 10,
                                  bottom: 5,
                                }}
                              >
                                <CartesianGrid
                                  stroke="#edf0f4"
                                  vertical={false}
                                />
                                <XAxis
                                  dataKey="date"
                                  tickFormatter={(s) => s.slice(0, 4)}
                                  minTickGap={65}
                                  axisLine={false}
                                  tickLine={false}
                                  dy={9}
                                />
                                {units.map((unit, axis) => (
                                  <YAxis
                                    key={unit}
                                    yAxisId={unit}
                                    orientation={axis === 0 ? "left" : "right"}
                                    label={{
                                      value: unit,
                                      position: "insideTop",
                                      offset: -3,
                                      fontSize: 11,
                                    }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={68}
                                    tickFormatter={(v) =>
                                      Number(v).toLocaleString("en", {
                                        maximumFractionDigits: 1,
                                      })
                                    }
                                  />
                                ))}
                                <Tooltip
                                  labelFormatter={(s) =>
                                    String(s).slice(
                                      0,
                                      view.frequency === "M" ? 7 : 4,
                                    )
                                  }
                                  formatter={(v, n, p) => {
                                    const point = selectPoints(
                                      data,
                                      String(p.dataKey),
                                      view,
                                    ).find(
                                      (x) =>
                                        x.date === (p.payload as any)?.date,
                                    );
                                    return [
                                      Number(v).toFixed(2) +
                                        " " +
                                        seriesUnit(
                                          data.indicators.find(
                                            (i) => i.id === p.dataKey,
                                          )!,
                                          view,
                                        ) +
                                        (view.frequency === "A" &&
                                        point &&
                                        data.indicators.find(
                                          (i) => i.id === p.dataKey,
                                        )?.frequency !== "A"
                                          ? `（${point.n} 个有效月）`
                                          : ""),
                                      n,
                                    ];
                                  }}
                                />
                                {units.map((unit) => (
                                  <ReferenceLine
                                    key={unit}
                                    yAxisId={unit}
                                    y={0}
                                    stroke="#d7dce5"
                                  />
                                ))}
                                {group.map((i) => (
                                  <Line
                                    key={i.id}
                                    type="linear"
                                    dataKey={i.id}
                                    yAxisId={seriesUnit(i, view)}
                                    name={i.title}
                                    stroke={
                                      palette[main.indexOf(i) % palette.length]
                                    }
                                    strokeWidth={1.9}
                                    dot={false}
                                    connectNulls={false}
                                    isAnimationActive={false}
                                  />
                                ))}
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="legend">
                            {group.map((i) => (
                              <button key={i.id} onClick={() => setDetail(i)}>
                                <span
                                  className="dot"
                                  style={{
                                    background:
                                      palette[main.indexOf(i) % palette.length],
                                  }}
                                />
                                {i.title} · {seriesUnit(i, view)}
                                {units.length === 2
                                  ? units.indexOf(seriesUnit(i, view)) === 0
                                    ? "（左轴）"
                                    : "（右轴）"
                                  : ""}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </>
                ) : chartTab === "table" ? (
                  <div className="px-6 pb-4">
                    <p className="mini mb-3">
                      显示最近 24
                      个有数据的时期；导出可获取所选范围全部原始观测。单位沿用各指标，空值显示
                      —。
                    </p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>时期</TableHead>
                          {main.map((i) => (
                            <TableHead key={i.id}>
                              {i.title}
                              <br />
                              {seriesUnit(i, view)}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows
                          .filter((r) => main.some((i) => r[i.id] !== null))
                          .slice(-24)
                          .reverse()
                          .map((r) => (
                            <TableRow key={String(r.date)}>
                              <TableCell>
                                {String(r.date).slice(
                                  0,
                                  view.frequency === "M" ? 7 : 4,
                                )}
                              </TableCell>
                              {main.map((i) => (
                                <TableCell key={i.id}>
                                  {r[i.id] === null
                                    ? "—"
                                    : Number(r[i.id]).toFixed(2)}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="px-6 pb-4">
                    <p className="text-sm text-muted-foreground mb-4">
                      Pearson 相关系数，按相同时期配对；年度仅使用双方均有 12
                      个月的数据。水平序列可能存在共同趋势，不能据此解释因果。
                    </p>
                    {research.statistics.length ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>指标对</TableHead>
                            <TableHead>r</TableHead>
                            <TableHead>样本 n</TableHead>
                            <TableHead>时期</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {research.statistics.map((p) => (
                            <TableRow key={p.a + p.b}>
                              <TableCell>
                                {
                                  data.indicators.find((i) => i.id === p.a)
                                    ?.title
                                }
                                <br />
                                {
                                  data.indicators.find((i) => i.id === p.b)
                                    ?.title
                                }
                              </TableCell>
                              <TableCell className="font-mono">
                                {p.r?.toFixed(3) ?? "—"}
                              </TableCell>
                              <TableCell>{p.n}</TableCell>
                              <TableCell>
                                {p.start?.slice(0, 7)} — {p.end?.slice(0, 7)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="empty-area">
                        至少选择两个指标后计算相关性。
                      </p>
                    )}
                  </div>
                )}
                <div className="source-note">
                  {main.some((i) => i.variable.startsWith("real_"))
                    ? "实际利率近似 = 同月名义利率 − 当期总体 CPI/HICP 同比；与预期实际利率、TIPS 不同。 "
                    : ""}
                  缺失月份留空，不插值。同比按去年同月计算，已知口径断点对应窗口留空。选用起点
                  100 时，以各序列区间内首个可用值为基准，起始月可能不同。{" "}
                  {view.frequency === "A"
                    ? "年度为有效月均值；悬停查看有效月数。"
                    : ""}
                  点击图例查看来源与完整口径。
                </div>
              </section>
              <div className="section-row">
                <h2>独立的观察空间</h2>
                <span className="subtle">
                  {data.spaces.length} 个空间 · {data.indicators.length} 个指标
                </span>
              </div>
              <div className="space-grid">
                {data.spaces.map((s, n) => (
                  <button
                    key={s.id}
                    className="panel space-card"
                    onClick={() => go(s.id)}
                  >
                    <div className="flex justify-between">
                      <span className="space-icon">
                        {n === 0 ? (
                          <TrendingUp size={20} />
                        ) : n === 1 ? (
                          <Activity size={20} />
                        ) : (
                          <Layers3 size={20} />
                        )}
                      </span>
                      <ArrowUpRight size={16} className="text-[#a2aab5]" />
                    </div>
                    <h3>{s.title}</h3>
                    <p className="line-clamp-2">
                      {s.description || "独立保存这一主题的长期观察。"}
                    </p>
                    <span className="mini">
                      {s.indicator_ids.length} 个指标
                    </span>
                  </button>
                ))}
              </div>
              <p className="footnote">
                目录数据核查截至 {String(data.catalog_as_of || data.as_of)}
                。各地区最新观测期不同；打开平台时按设置检查已接入来源，浏览器关闭时不运行。
              </p>
            </>
          )}
        </div>
      </SidebarInset>
      {modal === "space" && (
        <SpacePanel
          revision={revision}
          onClose={() => setModal(null)}
          onDone={async (id) => {
            const r = await load();
            setModal(null);
            if (r) {
              setSpace(id);
              setView((v) => ({ ...v, space: id, ids: [] }));
            }
          }}
        />
      )}
      {modal === "indicators" && (
        <IndicatorPanel
          data={data}
          view={view}
          onChange={(v) =>
            setView({
              ...v,
              transform: "level",
              seriesOptions: Object.fromEntries(
                v.ids.map((id) => [
                  id,
                  view.ids.includes(id)
                    ? view.seriesOptions?.[id] || { transform: "level" }
                    : { transform: "level" },
                ]),
              ),
              frequency: v.ids.some(
                (id) =>
                  data.indicators.find((i) => i.id === id)?.frequency === "A",
              )
                ? "A"
                : v.frequency,
            })
          }
          onClose={() => setModal(null)}
        />
      )}
      {modal === "import" && (
        <ImportPanel
          data={data}
          spaceId={view.space}
          revision={revision}
          onClose={() => setModal(null)}
          onDone={saveDone}
        />
      )}
      {modal === "ai" && (
        <AiPanel
          data={data}
          view={view}
          revision={revision}
          owner={owner}
          settings={settings}
          onClose={() => setModal(null)}
          onSettings={() => setModal("settings")}
        />
      )}
      {modal === "settings" && (
        <SettingsPanel
          settings={settings}
          owner={owner}
          revision={revision}
          onClose={() => setModal(null)}
          onDone={saveDone}
        />
      )}
      {detail && (
        <Modal
          title={detail.title}
          description={`${detail.coverage.start.slice(0, 7)} — ${detail.coverage.end.slice(0, 7)} · ${detail.coverage.count} 条观测 · ${detail.unit}`}
          wide
          onClose={() => setDetail(null)}
        >
          <p className="text-sm leading-7">{detail.definition}</p>
          {!!(
            data.observation_source_dates as
              | Record<string, Record<string, string>>
              | undefined
          )?.[detail.id] && (
            <p className="text-sm text-muted-foreground">
              最近原始观测日期：
              {Object.values(
                (
                  data.observation_source_dates as Record<
                    string,
                    Record<string, string>
                  >
                )[detail.id],
              )
                .sort()
                .at(-1)}
              。图中以月份或年份统一对齐。
            </p>
          )}
          <p className="status-message">{detail.comparability_note}</p>
          {(detail.coverage.missing_months?.length || 0) > 0 && (
            <p className="text-sm">
              统计区间内缺少 {detail.coverage.missing_months!.length} 个月：
              {detail.coverage
                .missing_months!.slice(0, 24)
                .map((d) => d.slice(0, 7))
                .join("、")}
              {detail.coverage.missing_months!.length > 24 ? "…" : ""}
              。覆盖范围之前及之后不作为已发布数据。
            </p>
          )}
          {detail.breaks.length > 0 && (
            <div>
              <h2 className="text-base mb-2">口径变化与缺口</h2>
              {detail.breaks.map((b, i) => (
                <p key={i} className="text-sm text-muted-foreground my-2">
                  {b.date || b.start + " — " + b.end} · {b.description}
                </p>
              ))}
            </div>
          )}
          <div>
            <h2 className="text-base mb-2">数据来源</h2>
            {detail.source.map((id) => {
              const s = data.sources[id];
              return s ? (
                <div key={id} className="border-t py-3">
                  <p className="text-sm">
                    {s.provider} · {s.series_id}
                  </p>
                  {safeLink(s.source_url) && (
                    <a
                      href={safeLink(s.source_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary text-sm inline-flex gap-1 mt-1"
                    >
                      查看原始来源
                      <ExternalLink size={13} />
                    </a>
                  )}
                  <p className="mini mt-2">{s.original_notes}</p>
                  {s.original_file && (
                    <a
                      className="text-primary text-sm"
                      href={"/api/source?id=" + encodeURIComponent(id)}
                    >
                      下载上传的源文件
                    </a>
                  )}
                </div>
              ) : null;
            })}
          </div>
        </Modal>
      )}
    </SidebarProvider>
  );
}
