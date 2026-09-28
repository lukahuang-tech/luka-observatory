"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Download,
  Copy,
  ArrowUpRight,
  Sparkles,
  Upload,
  Check,
  RefreshCw,
} from "lucide-react";
import { Dataset, View } from "@/lib/model";
import { researchContext } from "@/lib/research";
import { csvRows } from "@/lib/imports";
export async function api(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json()) as any;
  if (!response.ok) throw new Error(data.error || "操作失败，请稍后重试。");
  return data;
}
export function download(
  name: string,
  body: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
export function Choice({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string }[];
  label?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={"scroll-dialog " + (wide ? "sm:max-w-3xl" : "sm:max-w-xl")}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function SpacePanel({
  revision,
  onClose,
  onDone,
}: {
  revision: number;
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="新建观察空间"
      description="将一个研究主题放在独立的空间里，之后可以继续添加指标。"
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await api("/api/spaces", {
              title: name,
              description,
              revision,
            });
            onDone(r.space.id);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          空间名称
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：能源与电力"
            maxLength={60}
            required
          />
        </label>
        <label className="field">
          研究主题
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="想长期观察哪些变化？"
            maxLength={500}
          />
        </label>
        {error && <p className="status-message">{error}</p>}
        <Button className="w-full mt-4" disabled={busy || !name.trim()}>
          {busy ? "正在保存…" : "创建空间"}
        </Button>
      </form>
    </Modal>
  );
}
export function IndicatorPanel({
  data,
  view,
  onChange,
  onClose,
}: {
  data: Dataset;
  view: View;
  onChange: (v: View) => void;
  onClose: () => void;
}) {
  const [ids, setIds] = useState(view.ids);
  const [query, setQuery] = useState("");
  const list = data.indicators.filter(
    (i) => !query || i.title.includes(query) || i.variable.includes(query),
  );
  return (
    <Modal
      title="选择观察指标"
      description="最多同时观察 8 个指标；原始单位不同的指标会分别绘图。"
      wide
      onClose={onClose}
    >
      <input
        className="input"
        aria-label="搜索指标"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索国家、指标名称"
      />
      <div className="series-list max-h-[50vh] overflow-auto">
        {list.map((i) => (
          <label className="series-option" key={i.id}>
            <Checkbox
              checked={ids.includes(i.id)}
              disabled={!ids.includes(i.id) && ids.length >= 8}
              onCheckedChange={(checked) =>
                setIds((v) =>
                  checked ? [...v, i.id] : v.filter((id) => id !== i.id),
                )
              }
            />
            <span>
              {i.title}
              <small className="block mini">
                {i.display_unit} · {i.coverage.start.slice(0, 4)}—
                {i.coverage.end.slice(0, 7)}
                {i.role === "supplemental" ? " · 补充口径" : ""}
              </small>
            </span>
          </label>
        ))}
      </div>
      <Button
        disabled={!ids.length}
        onClick={() => {
          onChange({ ...view, ids });
          onClose();
        }}
      >
        应用 {ids.length} 个指标
      </Button>
    </Modal>
  );
}
export function ImportPanel({
  data,
  spaceId,
  revision,
  onClose,
  onDone,
}: {
  data: Dataset;
  spaceId: string;
  revision: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [input, setInput] = useState({
    spaceId,
    name: "",
    unit: "%",
    region: "自定义",
    frequency: "M",
    sourceUrl: "",
    definition: "",
    dateColumn: "",
    valueColumn: "",
    csv: "",
    filename: "",
  });
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (k: string, v: string) => {
    setInput((x) => ({ ...x, [k]: v }));
    setPreview(null);
  };
  async function check(commit = false) {
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/import", { ...input, revision, commit });
      if (commit) onDone();
      else setPreview(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="从文件添加指标"
      description="上传 CSV，确认日期、数值和单位后保存。Excel、PDF 等源文件也可以交给 Codex 整理后接入。"
      wide
      onClose={onClose}
    >
      <label className="field">
        源文件
        <input
          type="file"
          accept=".csv,.tsv,text/csv"
          className="input"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 2000000) {
              setError("文件超过 2 MB，请分批导入。");
              return;
            }
            try {
              const csv = await file.text();
              const headers = csvRows(csv)[0] || [];
              setHeaders(headers);
              setInput((x) => ({
                ...x,
                csv,
                filename: file.name,
                dateColumn: headers[0] || "",
                valueColumn: headers[1] || "",
                name: file.name.replace(/\.(csv|tsv)$/i, ""),
              }));
              setPreview(null);
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      </label>
      <div className="grid sm:grid-cols-2 gap-x-5">
        <label className="field">
          指标名称
          <input
            className="input"
            value={input.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </label>
        <label className="field">
          所属空间
          <Choice
            value={input.spaceId}
            onChange={(v) => update("spaceId", v)}
            items={data.spaces.map((s) => ({ value: s.id, label: s.title }))}
          />
        </label>
        <label className="field">
          日期列
          <Choice
            value={input.dateColumn}
            onChange={(v) => update("dateColumn", v)}
            items={headers.filter(Boolean).map((h) => ({ value: h, label: h }))}
          />
        </label>
        <label className="field">
          数值列
          <Choice
            value={input.valueColumn}
            onChange={(v) => update("valueColumn", v)}
            items={headers.filter(Boolean).map((h) => ({ value: h, label: h }))}
          />
        </label>
        <label className="field">
          单位（不会自动换算）
          <input
            className="input"
            value={input.unit}
            onChange={(e) => update("unit", e.target.value)}
            placeholder="%、十亿人民币、吨…"
          />
        </label>
        <label className="field">
          频率
          <Choice
            value={input.frequency}
            onChange={(v) => update("frequency", v)}
            items={[
              { value: "M", label: "月度 · YYYY-MM" },
              { value: "A", label: "年度 · YYYY" },
            ]}
          />
        </label>
        <label className="field">
          地区 / 对象
          <input
            className="input"
            value={input.region}
            onChange={(e) => update("region", e.target.value)}
          />
        </label>
        <label className="field">
          来源链接
          <input
            className="input"
            value={input.sourceUrl}
            onChange={(e) => update("sourceUrl", e.target.value)}
            placeholder="https://…"
          />
        </label>
      </div>
      <label className="field">
        统计口径
        <textarea
          className="input"
          value={input.definition}
          onChange={(e) => update("definition", e.target.value)}
          placeholder="记录单位、季调、时点及来源，方便将来核查。"
        />
      </label>
      {preview && (
        <div className="panel p-4">
          <p className="text-sm">
            <Check size={15} className="inline mr-2" />
            {preview.exists
              ? "这个文件与映射已导入，不会重复创建。"
              : `${preview.count} 条有效观测 · ${preview.start.slice(0, 7)} — ${preview.end.slice(0, 7)} · 单位 ${preview.unit}`}
          </p>
          <p className="mini mt-1">
            跳过 {preview.missing} 个空值；不填零、不插值。
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead>原始数值</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.preview.slice(0, 4).map((p: any) => (
                <TableRow key={p[0]}>
                  <TableCell>{p[0].slice(0, 7)}</TableCell>
                  <TableCell>{p[1]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {error && <p className="status-message">{error}</p>}
      <div className="flex gap-3 justify-end">
        <Button
          variant="outline"
          disabled={busy || !input.csv || !input.name}
          onClick={() => check(false)}
        >
          预览与检查
        </Button>
        <Button disabled={busy || !preview} onClick={() => check(true)}>
          {busy ? "正在处理…" : "确认保存"}
        </Button>
      </div>
    </Modal>
  );
}
export function AiPanel({
  data,
  view,
  revision,
  settings,
  owner,
  onClose,
  onSettings,
}: {
  data: Dataset;
  view: View;
  revision: number;
  settings: any;
  owner: boolean;
  onClose: () => void;
  onSettings: () => void;
}) {
  const [question, setQuestion] = useState(
    "分析这些指标的长期变化、异常时期和相互关系，并说明样本与口径限制。",
  );
  const [answer, setAnswer] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const context = researchContext(data, view, revision);
  const prompt = `请分析我随后附上的 observatory-research.json。问题：${question}\n核对单位、来源、缺口、断点和样本量，重算关键统计，区分关联与因果。`;
  return (
    <Modal
      title="按需智能分析"
      description="选择你习惯的研究方式。只有点击开始分析时，才会向所选模型发送当前数据。"
      wide
      onClose={onClose}
    >
      <div className="rounded-xl bg-[#f3f5f8] p-4">
        <p className="text-sm">
          {context.series.length} 个指标 · {view.start.slice(0, 7)} —{" "}
          {view.end.slice(0, 7)} · {view.frequency === "M" ? "月度" : "年度"}
        </p>
        <p className="mini mt-1">
          包含原始观测、单位、来源、口径说明和统计结果；不包含未选指标的数据或密钥。
        </p>
      </div>
      <label className="field">
        研究问题
        <textarea
          className="input min-h-24"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={4000}
        />
      </label>
      <Tabs defaultValue="platform">
        <TabsList className="w-full">
          <TabsTrigger value="platform" className="flex-1">
            在平台分析
          </TabsTrigger>
          <TabsTrigger value="codex" className="flex-1">
            交给 Codex
          </TabsTrigger>
        </TabsList>
        <TabsContent value="platform" className="pt-4">
          {!settings?.configured || !settings?.model ? (
            <div className="status-message">
              尚未接入模型。配置服务端密钥与模型后即可使用；现在可以下载研究包交给
              Codex。
              {owner && (
                <Button variant="link" onClick={onSettings}>
                  查看连接设置
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-3">
              发送到 {settings.provider} · {settings.model}
              ，供应商会处理所选数据。
            </p>
          )}
          <Button
            className="mt-4"
            disabled={
              busy ||
              !owner ||
              !settings?.configured ||
              !settings?.model ||
              !question.trim()
            }
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setAnswer(await api("/api/analyze", { question, view }));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Sparkles size={16} />
            {busy ? "正在分析…" : "开始分析"}
          </Button>
          {answer && (
            <div className="mt-5">
              <p className="mini mb-2">
                {answer.model} · {new Date(answer.createdAt).toLocaleString()} ·
                快照 {answer.snapshotRevision}
                {answer.status === "incomplete" ? " · 回答未完成" : ""}
              </p>
              <div className="ai-answer">{answer.text}</div>
              <Button
                variant="outline"
                className="mt-3"
                onClick={() =>
                  download("analysis.json", JSON.stringify(answer, null, 2))
                }
              >
                保存分析
              </Button>
            </div>
          )}
        </TabsContent>
        <TabsContent value="codex" className="pt-4">
          <ol className="text-sm text-muted-foreground leading-7 list-decimal pl-5">
            <li>下载当前研究包，数据和来源会一起保留。</li>
            <li>打开 Codex，附上研究包，再发送问题。</li>
          </ol>
          <div className="flex flex-wrap gap-3 mt-4">
            <Button
              onClick={() =>
                download(
                  "observatory-research.json",
                  JSON.stringify({ question, context }, null, 2),
                )
              }
            >
              <Download size={16} />
              下载研究包
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(prompt);
                  setCopied(true);
                } catch {
                  setError("无法自动复制，请选中问题后手动复制。");
                }
              }}
            >
              <Copy size={16} />
              {copied ? "已复制" : "复制说明"}
            </Button>
            <Button asChild variant="outline">
              <a href={"codex://new?prompt=" + encodeURIComponent(prompt)}>
                <ArrowUpRight size={16} />
                打开 Codex
              </a>
            </Button>
          </div>
          <p className="mini mt-3">
            打开 Codex 只会预填问题，不会自动发送或附加文件。
          </p>
        </TabsContent>
      </Tabs>
      {error && <p className="status-message">{error}</p>}
    </Modal>
  );
}
export function SettingsPanel({
  settings,
  owner,
  revision,
  onClose,
  onDone,
}: {
  settings: any;
  owner: boolean;
  revision: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [prefs, setPrefs] = useState(
    settings || {
      autoOnOpen: true,
      provider: "openai-responses",
      model: "",
      endpoint: "https://api.openai.com/v1",
    },
  );
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [restore, setRestore] = useState<any>(null);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <Modal
      title="平台设置"
      description="管理数据更新、模型连接和完整备份。"
      wide
      onClose={onClose}
    >
      <Tabs defaultValue="general">
        <TabsList className="w-full">
          <TabsTrigger value="general">更新与权限</TabsTrigger>
          <TabsTrigger value="model">模型连接</TabsTrigger>
          <TabsTrigger value="backup">备份与恢复</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="pt-5 space-y-5">
          <div className="flex justify-between gap-8">
            <div>
              <h2 className="text-base">打开平台时检查更新</h2>
              <p className="mini mt-1">
                已接入来源每 24 小时检查一次，浏览器关闭时不运行。
              </p>
            </div>
            <Switch
              checked={prefs.autoOnOpen}
              disabled={!owner}
              onCheckedChange={(v) =>
                setPrefs((x: any) => ({ ...x, autoOnOpen: v }))
              }
            />
          </div>
          <div className="status-message">
            后台定时更新尚未启用。部分来源仍需导入文件；具体状态见数据管理。
          </div>
          <div>
            <h2 className="text-base">访问范围</h2>
            <p className="text-sm text-muted-foreground mt-2">
              当前网站仅你可访问。需要邀请少数成员时，在 Codex
              提供要邀请的邮箱，再由网站访问权限管理邀请。受邀访客默认只读，只有你能导入数据和调用付费模型。
            </p>
          </div>
        </TabsContent>
        <TabsContent value="model" className="pt-4">
          <label className="field">
            接口协议
            <Choice
              value={prefs.provider}
              onChange={(v) =>
                setPrefs((x: any) => ({
                  ...x,
                  provider: v,
                  endpoint:
                    v === "openai-responses"
                      ? "https://api.openai.com/v1"
                      : x.endpoint,
                }))
              }
              items={[
                { value: "openai-responses", label: "OpenAI Responses" },
                {
                  value: "openai-compatible-chat",
                  label: "兼容 Chat Completions",
                },
              ]}
            />
          </label>
          <label className="field">
            服务地址
            <Choice
              value={prefs.endpoint}
              onChange={(v) => setPrefs((x: any) => ({ ...x, endpoint: v }))}
              items={(prefs.provider === "openai-responses"
                ? ["https://api.openai.com/v1"]
                : ["https://api.openai.com/v1", "https://api.deepseek.com/v1"]
              ).map((v) => ({ value: v, label: v }))}
            />
          </label>
          <label className="field">
            模型名称
            <input
              className="input"
              value={prefs.model}
              disabled={!owner}
              onChange={(e) =>
                setPrefs((x: any) => ({ ...x, model: e.target.value }))
              }
              placeholder="填入供应商账户中可用的模型 ID"
            />
          </label>
          <p className="status-message">
            {settings?.configured
              ? "已配置服务端密钥；真实连接在执行分析时验证。"
              : "尚未配置密钥。请在 Codex 启用 OpenAI Developers 插件后安全配置，或由 Codex 将其他供应商密钥配置到服务器。不要把密钥放入源文件或聊天说明。"}
          </p>
          <p className="mini mt-3">
            新增供应商时可添加独立适配器；模型不会常驻，打开面板和保存设置不产生模型调用。
          </p>
        </TabsContent>
        <TabsContent value="backup" className="pt-4">
          <h2 className="text-base">保留一份自己的数据</h2>
          <p className="text-sm text-muted-foreground my-3">
            备份包含所有空间、指标、观测、来源与口径。密钥不会导出。上传的原始
            CSV 保存在服务器，需单独下载。
          </p>
          <Button asChild variant="outline">
            <a href="/api/backup">
              <Download size={16} />
              下载完整数据备份
            </a>
          </Button>
          <label className="field mt-7">
            恢复数据备份
            <input
              className="input"
              type="file"
              accept=".json"
              disabled={!owner}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  if (f.size > 8000000) throw new Error("备份超过 8 MB。");
                  const v = JSON.parse(await f.text());
                  if (v.format !== "observatory-backup-v1")
                    throw new Error("不是平台数据备份。");
                  setRestore(v);
                  setConfirmed(false);
                  setStatus("");
                } catch (e) {
                  setStatus((e as Error).message);
                }
              }}
            />
          </label>
          {restore && (
            <div className="border rounded-xl p-4">
              <p className="text-sm">
                备份日期 {restore.exportedAt?.slice(0, 10)} ·{" "}
                {restore.data?.indicators?.length} 个指标
              </p>
              <label className="flex gap-3 items-start text-sm mt-4">
                <Checkbox
                  checked={confirmed}
                  onCheckedChange={(v) => setConfirmed(Boolean(v))}
                />
                我确认用此备份替换当前数据。服务器保留此前快照。
              </label>
              <Button
                disabled={!confirmed || busy}
                className="mt-4"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api("/api/backup", {
                      backup: restore,
                      confirm: "RESTORE",
                      revision,
                    });
                    onDone();
                  } catch (e) {
                    setStatus((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                确认恢复
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
      {status && <p className="status-message">{status}</p>}
      <div className="flex justify-end">
        <Button
          disabled={!owner || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("/api/settings", prefs);
              onDone();
            } catch (e) {
              setStatus((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "正在保存…" : "保存设置"}
        </Button>
      </div>
    </Modal>
  );
}
