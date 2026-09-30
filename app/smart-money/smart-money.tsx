"use client";
import { useEffect, useMemo, useState } from "react";
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
import {
  WorkspaceSwitch,
  WorkspaceMenuButton as SidebarMenuButton,
} from "@/components/workspace-switch";
import {
  ChartNoAxesCombined,
  LayoutGrid,
  Landmark,
  Layers3,
  Search,
  Database,
  LockKeyhole,
  Sparkles,
  Download,
  Upload,
  ExternalLink,
  ArrowUpRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Modal, api, download } from "@/app/panels";
import {
  actionName,
  actionResolver,
  aggregateSmart,
  comparisonIssue,
  currentQuarters,
  exactQuarter,
  money,
  quarterLabel,
  quarterTimeline,
  safeSecUrl,
  secGuide,
  smartMethod,
  smartPeriods,
  smartResearchContext,
  type SmartData,
  type Fund,
  type Quarter,
  type Holding,
} from "@/lib/smart-money";

const sections = [
  { id: "overview", title: "本季速览", icon: LayoutGrid },
  { id: "institutions", title: "机构名单", icon: Landmark },
  { id: "consensus", title: "共同持仓", icon: Layers3 },
  { id: "search", title: "标的反查", icon: Search },
  { id: "data", title: "数据与更新", icon: Database },
];
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
function Action({ value }: { value: string }) {
  return (
    <span className={`sm-action sm-action-${value}`}>{actionName(value)}</span>
  );
}
function displayName(h: { ticker: string; cusip: string }) {
  return h.ticker || h.cusip;
}

export default function SmartMoney() {
  const [data, setData] = useState<SmartData | null>(null);
  const [revision, setRevision] = useState(0),
    [owner, setOwner] = useState(false);
  const [period, setPeriod] = useState(""),
    [section, setSection] = useState("overview");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  const [detail, setDetail] = useState<Fund | null>(null),
    [detailPeriod, setDetailPeriod] = useState("");
  const [query, setQuery] = useState(""),
    [institutionQuery, setInstitutionQuery] = useState("");
  const [tab, setTab] = useState("common"),
    [ai, setAi] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/smart-money");
      setData(r.data);
      setRevision(r.revision);
      setOwner(r.owner);
      setPeriod((p) =>
        smartPeriods(r.data).includes(p) ? p : smartPeriods(r.data)[0],
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const doc = document as Document & {
      modelContext?: {
        registerTool: (tool: unknown, options: unknown) => void;
      };
    };
    if (!data || !period || !doc.modelContext) return;
    const life = new AbortController();
    try {
      doc.modelContext.registerTool(
        {
          name: "read_smart_money_context",
          title: "读取聪明钱研究数据",
          description:
            "Read the selected quarter's 13F holdings summary, source links, comparison gaps and scope. Read-only; does not call a model.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: (input: unknown) => {
            if (
              !input ||
              typeof input !== "object" ||
              Object.keys(input).length
            )
              throw new Error("Input must be an empty object.");
            return smartResearchContext(data, period, revision);
          },
        },
        { signal: life.signal },
      );
    } catch {
      /* Optional browser API; file export remains available. */
    }
    return () => life.abort();
  }, [data, period, revision]);
  const periods = useMemo(() => (data ? smartPeriods(data) : []), [data]);
  const current = useMemo(
    () => (data ? currentQuarters(data, period) : []),
    [data, period],
  );
  const aggregate = useMemo(
    () => (data ? aggregateSmart(data, period) : []),
    [data, period],
  );
  const actions = useMemo(
    () =>
      current.flatMap(({ fund, q }) => {
        const resolve = actionResolver(fund, q);
        return q.holdings.map((h) => ({ fund, h, action: resolve(h) }));
      }),
    [current],
  );
  const topAdd = [...aggregate]
    .filter((a) => a.adds >= 3)
    .sort((a, b) => b.adds - a.adds || b.totalValue - a.totalValue)[0];
  const topNew = actions
    .filter((x) => x.action === "new")
    .sort((a, b) => b.h.value - a.h.value)[0];
  const topReduce = actions
    .filter((x) => x.action === "reduce" && (x.h.valueDelta || 0) < 0)
    .sort((a, b) => (a.h.valueDelta || 0) - (b.h.valueDelta || 0))[0];
  const common = aggregate
    .filter((a) =>
      tab === "common"
        ? a.funds.length >= 3
        : tab === "adds"
          ? a.adds >= 3
          : a.reduces >= 3,
    )
    .sort((a, b) =>
      tab === "adds"
        ? b.adds - a.adds || b.totalValue - a.totalValue
        : tab === "reduces"
          ? b.reduces - a.reduces || b.totalValue - a.totalValue
          : b.totalValue - a.totalValue,
    );
  const search = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return current
      .flatMap(({ fund, q }) =>
        q.holdings
          .filter((h) =>
            [h.ticker, h.issuer, h.cusip]
              .join(" ")
              .toLowerCase()
              .includes(term),
          )
          .map((h) => ({ fund, q, h })),
      )
      .sort((a, b) => b.h.value - a.h.value);
  }, [query, current]);
  const openFund = (f: Fund) => {
    setDetail(f);
    setDetailPeriod(period);
  };
  const exportContext = () =>
    data &&
    download(
      `smart-money-research-${period}.json`,
      JSON.stringify(smartResearchContext(data, period, revision), null, 2),
    );

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
          <WorkspaceSwitch active="smart-money" />
          <div className="nav-section mt-3">聪明钱观察</div>
          <SidebarMenu>
            {sections.map((s) => (
              <SidebarMenuItem key={s.id}>
                <SidebarMenuButton
                  className="nav-item"
                  isActive={section === s.id}
                  onClick={() => setSection(s.id)}
                >
                  <s.icon />
                  <span>{s.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className="sm-sidebar-note">
            SEC · 13F 季度持仓
            <br />
            机构的公开持仓足迹
          </div>
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
              聪明钱观察 <span className="px-3 text-[#bdc2ca]">/</span>
              {sections.find((s) => s.id === section)?.title}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!data}
            onClick={() => setAi(true)}
          >
            <Sparkles size={15} />
            智能分析
          </Button>
        </header>
        <main className="workspace-main sm-workspace">
          <div className="title-row">
            <div>
              <div className="eyebrow">SMART MONEY</div>
              <h1>
                {section === "overview"
                  ? "读懂机构的持仓足迹"
                  : sections.find((s) => s.id === section)?.title}
              </h1>
              <p>公开申报，逐季观察。将机构、标的与持仓变化放在同一个视野。</p>
            </div>
            <label className="sm-period">
              报告期
              <select
                className="input"
                aria-label="报告期"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                disabled={!data}
              >
                {periods.map((p) => (
                  <option key={p} value={p}>
                    {quarterLabel(p)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && (
            <div className="sm-message" role="alert">
              {error}
              <Button variant="outline" size="sm" onClick={load}>
                重新加载
              </Button>
            </div>
          )}
          {busy && !data && (
            <div className="panel sm-empty" role="status">
              正在读取你的机构持仓快照…
            </div>
          )}
          {data && (
            <>
              {section === "overview" ? (
                <div className="sm-summary">
                  <div className="panel">
                    <span className="subtle">所选季度覆盖</span>
                    <strong>
                      {current.length}
                      <small> / {data.fundOrder.length} 家机构</small>
                    </strong>
                    <span className="subtle">
                      {data.fundOrder.length - current.length
                        ? `${data.fundOrder.length - current.length} 家无该期数据，未混入同期统计`
                        : "所有机构均有该期数据"}
                    </span>
                  </div>
                  <div className="panel">
                    <span className="subtle">共同持仓 · 至少 3 家</span>
                    <strong>
                      {aggregate
                        .filter((a) => a.funds.length >= 3)
                        .length.toLocaleString()}
                      <small> 个标的</small>
                    </strong>
                    <span className="subtle">仅统计已保存的非期权 SH 记录</span>
                  </div>
                  <div className="panel">
                    <span className="subtle">文件生成日期</span>
                    <strong>{data.generatedAt.slice(0, 10)}</strong>
                    <span className="subtle">
                      最新导入版本 {revision} · 非实时持仓
                    </span>
                  </div>
                </div>
              ) : (
                <p className="subtle mb-6">
                  {quarterLabel(period)} · 同季覆盖 {current.length} /{" "}
                  {data.fundOrder.length} 家 · 文件生成{" "}
                  {data.generatedAt.slice(0, 10)} · 版本 {revision}
                </p>
              )}

              {section === "overview" && (
                <div className="sm-insights panel">
                  <div>
                    <span className="subtle">同步加仓最多</span>
                    <strong>
                      {topAdd
                        ? topAdd.ticker || topAdd.cusip
                        : "暂无 ≥3 家记录"}
                    </strong>
                    <p>
                      {topAdd
                        ? `${topAdd.adds} 家可比机构增加持有数量`
                        : "不使用缺失或待复核动作"}
                    </p>
                  </div>
                  <div>
                    <span className="subtle">新进观察</span>
                    <strong>
                      {topNew ? displayName(topNew.h) : "暂无可比记录"}
                    </strong>
                    <p>
                      {topNew
                        ? `${topNew.fund.nameZh} · 当前市值 ${money(topNew.h.value)}`
                        : "按已保存、可比较的新进记录筛选"}
                    </p>
                  </div>
                  <div>
                    <span className="subtle">减仓观察</span>
                    <strong>
                      {topReduce ? displayName(topReduce.h) : "暂无可比记录"}
                    </strong>
                    <p>
                      {topReduce
                        ? `${topReduce.fund.nameZh} · 市值减少 ${money(Math.abs(topReduce.h.valueDelta || 0))}，含价格影响`
                        : "按减股且市值下降的记录筛选"}
                    </p>
                  </div>
                </div>
              )}

              {(section === "overview" || section === "institutions") && (
                <section className="sm-section">
                  <div className="sm-section-head">
                    <div>
                      <h2>
                        {section === "overview" ? "重点关注" : "所有机构"}
                      </h2>
                      <p className="subtle">
                        点击机构查看季度趋势、前十大与完整已存持仓。
                      </p>
                    </div>
                    {section === "overview" ? (
                      <Button
                        variant="ghost"
                        onClick={() => setSection("institutions")}
                      >
                        查看全部 {data.fundOrder.length} 家
                        <ArrowUpRight size={16} />
                      </Button>
                    ) : (
                      <input
                        className="input sm-filter"
                        aria-label="搜索机构"
                        placeholder="搜索机构名称"
                        value={institutionQuery}
                        onChange={(e) => setInstitutionQuery(e.target.value)}
                      />
                    )}
                  </div>
                  <div className="sm-fund-grid">
                    {(section === "overview"
                      ? data.defaultKeys
                      : data.fundOrder
                    )
                      .filter(
                        (k) =>
                          section === "overview" ||
                          `${data.funds[k].nameZh} ${data.funds[k].nameEn}`
                            .toLowerCase()
                            .includes(institutionQuery.toLowerCase()),
                      )
                      .map((k) => {
                        const f = data.funds[k],
                          q = exactQuarter(f, period),
                          latest = [...f.quarters].sort((a, b) =>
                            b.period.localeCompare(a.period),
                          )[0];
                        return (
                          <button
                            key={k}
                            className="panel sm-fund-card"
                            onClick={() => openFund(f)}
                          >
                            <div className="sm-fund-title">
                              <span className="sm-fund-icon">
                                <Landmark size={19} />
                              </span>
                              <span className="sm-tag">{f.style}</span>
                            </div>
                            <h3>{f.nameZh}</h3>
                            <div className="subtle sm-fund-en">{f.nameEn}</div>
                            <div className="sm-fund-numbers">
                              <div>
                                <span className="subtle">申报持仓总值</span>
                                <strong>
                                  {q ? money(q.totalValue) : "该期暂无数据"}
                                </strong>
                              </div>
                              <div>
                                <span className="subtle">持仓数</span>
                                <strong>
                                  {q ? q.holdingsCount.toLocaleString() : "—"}
                                </strong>
                              </div>
                            </div>
                            <div className="sm-card-foot">
                              {f.refreshError ? "更新失败 · 保留原数据 · " : ""}
                              {q
                                ? `${quarterLabel(q.period)} · ${q.isTrimmed ? `已存 ${q.holdings.length} 笔` : "已存本期持仓"}`
                                : `最近已存 ${quarterLabel(latest?.period || "")}`}
                              {q && comparisonIssue(f, q)
                                ? " · 动作待复核"
                                : ""}
                              <ArrowUpRight size={15} />
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </section>
              )}

              {(section === "overview" || section === "consensus") && (
                <section className="panel sm-section">
                  <div className="panel-head">
                    <div>
                      <h2>共同持仓</h2>
                      <p className="subtle">
                        同一报告期、同一证券类型；仅覆盖已保存记录。
                      </p>
                    </div>
                    {section === "overview" && (
                      <Button
                        variant="ghost"
                        onClick={() => setSection("consensus")}
                      >
                        展开
                        <ArrowUpRight size={16} />
                      </Button>
                    )}
                  </div>
                  <div
                    className="sm-tabs"
                    role="group"
                    aria-label="共同持仓筛选"
                  >
                    {[
                      ["common", "共同持有"],
                      ["adds", "同步加仓"],
                      ["reduces", "同步减仓"],
                    ].map(([id, title]) => (
                      <button
                        key={id}
                        aria-pressed={tab === id}
                        onClick={() => setTab(id)}
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                  {common.length ? (
                    <div className="sm-clusters">
                      {common
                        .slice(0, section === "overview" ? 5 : 40)
                        .map((a) => (
                          <div key={a.id} className="sm-cluster">
                            <div>
                              <strong>{a.ticker || a.cusip}</strong>
                              <div className="subtle">{a.issuer}</div>
                            </div>
                            <div>
                              <strong>{a.funds.length} 家</strong>
                              <div className="subtle">共同持有</div>
                            </div>
                            <div className="sm-right">
                              <strong>{money(a.totalValue)}</strong>
                              <div className="subtle">所选机构合计市值</div>
                            </div>
                            <div className="sm-cluster-funds">
                              {a.funds
                                .sort((a, b) => b.value - a.value)
                                .map((f) => (
                                  <button
                                    key={f.key}
                                    onClick={() => openFund(data.funds[f.key])}
                                  >
                                    {f.name}
                                    <span>{actionName(f.action)}</span>
                                  </button>
                                ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="sm-empty">
                      所选季度没有满足至少 3 家条件的记录。
                    </div>
                  )}
                  {section === "consensus" && (
                    <p className="sm-footnote">
                      展示前 {Math.min(common.length, 40)} / {common.length}{" "}
                      项；按{tab === "common" ? "市值" : "同步动作机构数"}
                      排序。动作按持股数判断，基期、证券类型改变和异常比较不计入增减仓。
                    </p>
                  )}
                </section>
              )}

              {section === "search" && (
                <section className="panel sm-section">
                  <div className="panel-head">
                    <div>
                      <h2>谁持有这个标的</h2>
                      <p className="subtle">
                        使用代码、公司名或 CUSIP。未映射的股票代码请改用公司名。
                      </p>
                    </div>
                  </div>
                  <div className="sm-search">
                    <Search size={19} />
                    <input
                      aria-label="反查标的"
                      placeholder="AAPL / NVIDIA / 037833100"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  {!query.trim() ? (
                    <div className="sm-empty">
                      输入一个标的，查看所选季度的持有人。
                    </div>
                  ) : !search.length ? (
                    <div className="sm-empty">
                      已保存的该期记录中没有匹配。部分机构仅保留前 500 笔。
                    </div>
                  ) : (
                    <>
                      <p className="sm-footnote">
                        {new Set(search.map((s) => s.fund.key)).size} 家机构 ·{" "}
                        {search.length} 条记录 · 展示前 100 条
                      </p>
                      <div className="sm-table-wrap">
                        <table className="sm-table">
                          <thead>
                            <tr>
                              <th>机构</th>
                              <th>标的</th>
                              <th>证券类型</th>
                              <th className="sm-right">持仓市值</th>
                              <th className="sm-right">权重</th>
                              <th>动作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {search.slice(0, 100).map(({ fund, q, h }, i) => (
                              <tr key={`${fund.key}-${i}`}>
                                <td>
                                  <button
                                    onClick={() => openFund(fund)}
                                    className="sm-link"
                                  >
                                    {fund.nameZh}
                                  </button>
                                </td>
                                <td>
                                  <strong>{displayName(h)}</strong>
                                  <div className="subtle">{h.issuer}</div>
                                </td>
                                <td>{h.putCall || h.shareType}</td>
                                <td className="sm-right">{money(h.value)}</td>
                                <td className="sm-right">{pct(h.weight)}</td>
                                <td>
                                  <Action value={actionResolver(fund, q)(h)} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </section>
              )}

              {section === "data" && (
                <SmartDataPanel
                  data={data}
                  revision={revision}
                  owner={owner}
                  onSaved={load}
                />
              )}
              <div className="sm-method">
                <strong>观察口径</strong>
                <p>{smartMethod}</p>
                <a href={secGuide} target="_blank" rel="noreferrer">
                  SEC 13F 说明 <ExternalLink size={12} />
                </a>
              </div>
            </>
          )}
        </main>
      </SidebarInset>
      {detail && (
        <FundDetail
          fund={detail}
          period={detailPeriod}
          onPeriod={setDetailPeriod}
          onClose={() => setDetail(null)}
        />
      )}
      {ai && data && (
        <SmartAi
          data={data}
          revision={revision}
          period={period}
          owner={owner}
          onClose={() => setAi(false)}
          onExport={exportContext}
        />
      )}
    </SidebarProvider>
  );
}

function FundDetail({
  fund,
  period,
  onPeriod,
  onClose,
}: {
  fund: Fund;
  period: string;
  onPeriod: (p: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(""),
    [professional, setProfessional] = useState(false),
    [exits, setExits] = useState(false),
    [sort, setSort] = useState("value"),
    [limit, setLimit] = useState(100);
  const q = exactQuarter(fund, period);
  const quarters = [...fund.quarters]
    .filter((q) => q.status !== "missing")
    .sort((a, b) => a.period.localeCompare(b.period));
  const issue = q && comparisonIssue(fund, q);
  const resolveAction = q ? actionResolver(fund, q) : () => "unverified";
  const rows = q
    ? [...q.holdings, ...(exits ? q.exits : [])]
        .filter((h) =>
          [h.ticker, h.issuer, h.cusip, h.class]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort((a, b) => {
          const change = (h: Holding) =>
            ["base", "unverified"].includes(resolveAction(h))
              ? -1
              : Math.abs(h.shareDelta || 0) / Math.max(h.prevShares || 0, 1);
          return sort === "change"
            ? change(b) - change(a)
            : (b.value || b.prevValue || 0) - (a.value || a.prevValue || 0);
        })
    : [];
  return (
    <Modal
      title={fund.nameZh}
      description={`${fund.nameEn} · CIK ${fund.cik}`}
      onClose={onClose}
      wide
    >
      {fund.refreshError && (
        <p className="sm-warning">
          更新失败：{fund.refreshError}。机构快照时间：
          {fund.updatedAt?.slice(0, 10) || "未知"}。
        </p>
      )}
      <div className="sm-detail-toolbar">
        <select
          className="input"
          aria-label="机构详情报告期"
          value={period}
          onChange={(e) => {
            onPeriod(e.target.value);
            setLimit(100);
          }}
        >
          {!q && (
            <option value={period}>{quarterLabel(period)} · 无数据</option>
          )}
          {[...quarters].reverse().map((q) => (
            <option key={q.period} value={q.period}>
              {quarterLabel(q.period)}
            </option>
          ))}
        </select>
        {q && safeSecUrl(q.sourceUrl) && (
          <a
            className="sm-link"
            href={safeSecUrl(q.sourceUrl)}
            target="_blank"
            rel="noreferrer"
          >
            SEC 原表
            <ExternalLink size={14} />
          </a>
        )}
      </div>
      {!q ? (
        <div className="sm-empty">
          该机构没有所选季度数据。请在上方选择已存季度。
        </div>
      ) : (
        <>
          <div className="sm-detail-stats">
            <div>
              <span className="subtle">申报持仓总值</span>
              <strong>{money(q.totalValue)}</strong>
            </div>
            <div>
              <span className="subtle">申报 / 已存持仓</span>
              <strong>
                {q.holdingsCount.toLocaleString()} /{" "}
                {q.holdings.length.toLocaleString()}
              </strong>
            </div>
            <div>
              <span className="subtle">披露日期</span>
              <strong>{q.filingDate}</strong>
            </div>
          </div>
          {issue && (
            <p className="sm-warning">
              {issue}；保留持仓展示，不将该期动作计入同步增减仓。
            </p>
          )}
          <p className="subtle">
            已存可比记录：
            {["new", "add", "reduce", "exit"]
              .map(
                (a) =>
                  `${actionName(a)} ${[...q.holdings, ...q.exits].filter((h) => resolveAction(h) === a).length}`,
              )
              .join(" / ")}
            。基期和待复核记录不计入。
          </p>
          <div className="sm-detail-charts">
            <div>
              <h3>季度总市值</h3>
              <div style={{ height: 170 }}>
                <ResponsiveContainer>
                  <LineChart
                    data={quarterTimeline(fund)}
                    margin={{ left: 0, right: 12, top: 16, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} stroke="#e9edf2" />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis hide domain={["auto", "auto"]} />
                    <Tooltip
                      formatter={(v) => [money(Number(v)), "申报总市值"]}
                    />
                    <Line
                      dataKey="value"
                      stroke="#456b9b"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="subtle">含价格变化，不等于净买入。</p>
            </div>
            <div>
              <h3>前十大持仓占比</h3>
              {[...q.holdings]
                .sort((a, b) => b.value - a.value)
                .slice(0, 10)
                .map((h, i) => (
                  <div className="sm-weight" key={i}>
                    <span title={h.issuer}>{displayName(h)}</span>
                    <div>
                      <i
                        style={{ width: `${Math.min(100, h.weight * 100)}%` }}
                      />
                    </div>
                    <span>{pct(h.weight)}</span>
                  </div>
                ))}
            </div>
          </div>
          <div className="sm-detail-controls">
            <input
              className="input"
              aria-label="筛选持仓"
              placeholder="名称 / CUSIP / ticker"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(100);
              }}
            />
            <select
              className="input"
              aria-label="持仓排序"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="value">按市值排序</option>
              <option value="change">按股数变动比例</option>
            </select>
            <label>
              <input
                type="checkbox"
                checked={exits}
                onChange={(e) => setExits(e.target.checked)}
              />
              显示清仓
            </label>
            <label>
              <input
                type="checkbox"
                checked={professional}
                onChange={(e) => setProfessional(e.target.checked)}
              />
              专业视图
            </label>
          </div>
          <div className="sm-table-wrap">
            <table className="sm-table">
              <thead>
                <tr>
                  <th>标的 / 类型</th>
                  {professional && <th>CUSIP</th>}
                  <th className="sm-right">市值</th>
                  {professional && (
                    <>
                      <th className="sm-right">权重</th>
                      <th className="sm-right">持有数量</th>
                      <th>投票权 独 / 共 / 无</th>
                    </>
                  )}
                  <th className="sm-right">数量变化</th>
                  <th>动作</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((h, i) => {
                  const action = resolveAction(h),
                    unavailable = ["base", "unverified"].includes(action),
                    exit = h.action === "exit";
                  return (
                    <tr key={i}>
                      <td>
                        <strong>{displayName(h)}</strong>
                        <div className="subtle">{h.issuer}</div>
                        <div className="subtle">
                          {h.class} · {h.putCall || h.shareType}
                        </div>
                      </td>
                      {professional && <td>{h.cusip}</td>}
                      <td className="sm-right">
                        {money(exit ? h.prevValue || 0 : h.value)}
                        {exit && <div className="subtle">前期市值</div>}
                      </td>
                      {professional && (
                        <>
                          <td className="sm-right">
                            {exit ? "—" : pct(h.weight)}
                          </td>
                          <td className="sm-right">
                            {(exit ? 0 : h.shares).toLocaleString()}
                          </td>
                          <td>
                            {[h.voteSole, h.voteShared, h.voteNone]
                              .map((n) => n?.toLocaleString() ?? "—")
                              .join(" / ")}
                          </td>
                        </>
                      )}
                      <td className="sm-right">
                        {unavailable
                          ? "—"
                          : `${(h.shareDelta || 0) > 0 ? "+" : ""}${(h.shareDelta || 0).toLocaleString()}`}
                      </td>
                      <td>
                        <Action value={action} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!rows.length && <div className="sm-empty">没有匹配记录。</div>}
          {rows.length > limit && (
            <Button variant="outline" onClick={() => setLimit((n) => n + 100)}>
              再显示 100 条（当前 {limit} / {rows.length}）
            </Button>
          )}
          <p className="subtle">
            {q.isTrimmed
              ? `本期原工作台仅存 ${q.holdings.length} / ${q.holdingsCount} 笔。`
              : ""}{" "}
            清仓记录最多保留原快照中的 200 笔。股数变化未调整拆股等公司行动。带
            Put/Call 的旧记录可能混合多种证券，不用于方向判断。
          </p>
        </>
      )}
    </Modal>
  );
}

function SmartDataPanel({
  data,
  revision,
  owner,
  onSaved,
}: {
  data: SmartData;
  revision: number;
  owner: boolean;
  onSaved: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null),
    [text, setText] = useState("");
  const [summary, setSummary] = useState<{
    institutions: number;
    quarters: number;
    overlaps: number;
    retained: number;
    totalQuarters: number;
    generatedAt: string;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function submit(commit: boolean) {
    setBusy(true);
    setMessage("");
    try {
      if (!file || file.size > 25_000_000)
        throw new Error("请选择不超过 25 MB 的 HTML 或 JSON 文件。");
      const content = commit ? text : await file.text();
      const response = await fetch("/api/smart-money", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
          "x-snapshot-revision": String(revision),
          "x-import-commit": String(commit),
        },
        body: content,
      });
      const r = (await response.json()) as {
        error?: string;
        summary: NonNullable<typeof summary>;
      };
      if (!response.ok) throw new Error(r.error);
      if (commit) {
        await onSaved();
        setSummary(null);
        setText("");
        setFile(null);
        setMessage("已保存到聪明钱观察。历史季度已保留。");
      } else {
        setText(content);
        setSummary(r.summary);
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel sm-section sm-data-panel">
      <h2>把原工作台接续到这里</h2>
      <p>
        已迁入 {data.fundOrder.length} 家机构、
        {Object.values(data.funds).reduce(
          (n, f) => n + f.quarters.length,
          0,
        )}{" "}
        个机构季度。原来的本地工作台可以继续使用。
      </p>
      <ol>
        <li>在原文件夹运行「更新13F数据.command」。</li>
        <li>选择更新完成的 index.html，或导出的 13F JSON。</li>
        <li>
          预览后保存。相同季度合并较新的有效记录；较旧文件、失败记录不会覆盖现有有效持仓，未包含的历史季度继续保留。
        </li>
      </ol>
      <p className="sm-warning">
        当前为文件更新方式；网站尚未直接定时抓取
        SEC。原更新器的单位判断、期权合并及修订报告处理仍需复核。
      </p>
      <div className="sm-import-actions">
        <input
          type="file"
          accept=".html,.json,application/json,text/html"
          aria-label="选择13F更新文件"
          disabled={!owner || busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setSummary(null);
            setText("");
            setMessage("");
          }}
        />
        <Button
          variant="outline"
          disabled={!owner || !file || busy}
          onClick={() => submit(false)}
        >
          <Upload size={15} />
          {busy ? "处理中…" : "预览导入"}
        </Button>
      </div>
      {summary && (
        <div className="sm-import-preview">
          <strong>
            即将导入 {summary.institutions} 家机构 / {summary.quarters}{" "}
            个机构季度
          </strong>
          <p>
            其中 {summary.overlaps} 个与已有季度重合，{summary.retained}{" "}
            个较旧或失败记录被跳过；保存后共 {summary.totalQuarters}{" "}
            个机构季度。文件生成时间：{summary.generatedAt.slice(0, 10)}。
          </p>
          <Button disabled={busy} onClick={() => submit(true)}>
            保存这批数据
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="sm-message">
          {message}
        </p>
      )}
      <div className="sm-export">
        <Button
          variant="outline"
          onClick={() =>
            download(
              "smart-money-backup.json",
              JSON.stringify({
                format: "observatory-smart-money-v1",
                exportedAt: new Date().toISOString(),
                revision,
                data,
              }),
            )
          }
        >
          <Download size={15} />
          导出完整聪明钱备份
        </Button>
        <p className="subtle">
          宏观指标在“数据观察”里独立管理，两个分类共用登录与模型设置。
        </p>
      </div>
    </section>
  );
}

function SmartAi({
  data,
  revision,
  period,
  owner,
  onClose,
  onExport,
}: {
  data: SmartData;
  revision: number;
  period: string;
  owner: boolean;
  onClose: () => void;
  onExport: () => void;
}) {
  const [question, setQuestion] = useState(
    "比较本季机构的共同持仓与主要差异，并说明数据缺口和局限。",
  );
  const [busy, setBusy] = useState(false),
    [answer, setAnswer] = useState(""),
    [error, setError] = useState("");
  return (
    <Modal
      title="聪明钱 · 智能分析"
      description={`${quarterLabel(period)} · ${currentQuarters(data, period).length} 家同季机构 · 快照版本 ${revision}`}
      onClose={onClose}
    >
      <p className="subtle">
        下载研究包交给 Codex /
        GPT；或使用平台设置中已配置的模型。研究包包含各机构前 10 笔、共同持仓前
        20 项、来源与口径。
      </p>
      <Button variant="outline" onClick={onExport}>
        <Download size={15} />
        下载研究包
      </Button>
      <label className="field">
        研究问题
        <textarea
          className="input"
          rows={4}
          maxLength={4000}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
      </label>
      <Button
        disabled={!owner || busy || !question.trim()}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const r = await api("/api/analyze", {
              domain: "smart-money",
              period,
              question,
            });
            setAnswer(r.text);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Sparkles size={15} />
        {busy ? "正在分析…" : "调用已配置模型"}
      </Button>
      <p className="subtle">
        仅点击后调用模型，可能产生费用。模型设置沿用“数据观察 → 平台设置”。
      </p>
      {error && (
        <p role="alert" className="sm-warning">
          {error}
        </p>
      )}
      {answer && <div className="sm-ai-answer">{answer}</div>}
    </Modal>
  );
}
