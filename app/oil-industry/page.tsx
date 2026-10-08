import { Fragment, type ReactNode } from "react";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import reading from "@/data/oil-industry-reading.json";
import ReadingShell from "./reading-shell";
import "./reading.css";

export const metadata = {
  title: "石油产业链 · 观测",
  description: "从油气开采、炼化与材料，到消费商品和农业的完整阅读图谱。",
};

type Block = {
  kind: string; level?: number; text?: string; id?: string;
  items?: string[]; labels?: string[]; rows?: string[][];
};
const blocks: Block[] = reading.blocks;

// Render the reviewed document's two inline forms as React nodes. Links are
// restricted to HTTPS/HTTP, and all remaining text stays escaped by React.
function Inline({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s]+?)\)/g;
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    nodes.push(text.slice(start, match.index));
    nodes.push(match[1]
      ? <strong key={match.index}>{match[1]}</strong>
      : <a key={match.index} href={match[3]} target="_blank" rel="noreferrer">{match[2]}<span className="sr-only">（新窗口）</span></a>);
    start = match.index! + match[0].length;
  }
  nodes.push(text.slice(start));
  return <>{nodes}</>;
}

function ReadingBlock({ block, index }: { block: Block; index: number }) {
  if (block.kind === "heading") {
    const Heading = `h${block.level}` as "h2" | "h3" | "h4";
    return <Heading id={block.id} tabIndex={-1}><a className="oil-heading-link" href={`#${block.id}`}>{block.text}</a></Heading>;
  }
  if (block.kind === "paragraph") return <p><Inline text={block.text!} /></p>;
  if (block.kind === "list") return <ul>{block.items!.map((text, i) => <li key={i}><Inline text={text} /></li>)}</ul>;
  if (block.kind === "companies") return (
    <div className="oil-companies">
      {block.rows!.map((row, i) => {
        const [name, ...security] = row[0].split("；");
        return <section className="oil-company" key={i} aria-labelledby={`company-${index}-${i}`}>
          <h4 id={`company-${index}-${i}`}><Inline text={name} /></h4>
          <p className="oil-security">{security.join(" · ")}</p>
          <dl>
            {row.slice(1).map((value, column) => <div key={column} className={column === 2 ? "oil-company-notes" : undefined}>
              <dt>{block.labels![column + 1]}</dt><dd><Inline text={value} /></dd>
            </div>)}
          </dl>
        </section>;
      })}
    </div>
  );
  return null;
}

export default async function OilIndustryPage() {
  await requireChatGPTUser("/oil-industry");
  const chapters = blocks.filter(b => b.level === 2).map(b => ({ id: b.id!, text: b.text! }));
  const applicationStart = blocks.findIndex(b => b.id === "applications");
  const categories = blocks.slice(applicationStart).filter(b => b.level === 3).map(b => ({ id: b.id!, text: b.text! }));
  const sections = ["companies", "routes", "applications"];
  return (
    <ReadingShell chapters={chapters} categories={categories}>
      <article className="oil-reading" aria-labelledby="reading-top">
        <header className="oil-intro">
          <div className="oil-eyebrow">产业研究 · ENERGY & MATERIALS</div>
          <h1 id="reading-top" tabIndex={-1}>{blocks[0].text}</h1>
          <p className="oil-lead">从地下的油气，到手中的商品，再到田间与餐桌。</p>
          <div className="oil-metrics" aria-label="内容规模">
            <span><b>{reading.counts.companies}</b> 家上市公司</span>
            <span><b>{reading.counts.routes}</b> 条原料路线</span>
            <span><b>{reading.counts.applications}</b> 项部件应用</span>
          </div>
          <nav className="oil-chapter-links" aria-label="章节快捷入口">
            {chapters.map((chapter, i) => <a key={chapter.id} href={`#${chapter.id}`}><span>0{i + 1}</span>{chapter.text.replace(/^[一二三]、/, "")}</a>)}
          </nav>
        </header>
        {blocks.slice(1).map((block, i) => {
          const index = i + 1;
          const isChapter = sections.includes(block.id ?? "");
          const nextChapter = blocks.findIndex((b, j) => j > index && b.level === 2);
          const subsections = isChapter ? blocks.slice(index + 1, nextChapter < 0 ? undefined : nextChapter).filter(b => b.level === 3) : [];
          return <Fragment key={index}>
            <ReadingBlock block={block} index={index} />
            {subsections.length > 0 && <details className="oil-section-index">
              <summary>本章索引 · {subsections.length} {block.id === "applications" ? "个领域" : block.id === "routes" ? "条路线" : "个环节"}</summary>
              <nav aria-label={`${block.text}索引`}>{subsections.map(sub => <a key={sub.id} href={`#${sub.id}`}>{sub.text}</a>)}</nav>
            </details>}
          </Fragment>;
        })}
        <footer className="oil-reading-footer"><span>全文完 · 研究资料截至 2026 年 10 月 8 日</span><a href="#reading-top">返回开篇 ↑</a></footer>
      </article>
    </ReadingShell>
  );
}
