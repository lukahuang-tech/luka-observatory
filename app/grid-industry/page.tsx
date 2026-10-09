import { Fragment, type ReactNode } from "react";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import reading from "@/data/grid-industry-reading.json";
import ReadingShell from "./reading-shell";
import "../oil-industry/reading.css";
import "./grid.css";

export const metadata = {
  title: "电力与电网产业链 · 观测",
  description: "从发电、输变配到用电与储能的完整阅读图谱。",
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
  if (block.kind === "table") return (
    <div className="grid-table-wrap" role="region" aria-label={block.labels![0]} tabIndex={0}>
      <table className="grid-table">
        <thead><tr>{block.labels!.map((label, i) => <th key={i} scope="col"><Inline text={label} /></th>)}</tr></thead>
        <tbody>{block.rows!.map((row, i) => <tr key={i}>{row.map((cell, j) => j === 0
          ? <th key={j} scope="row"><Inline text={cell} /></th>
          : <td key={j}><Inline text={cell} /></td>)}</tr>)}</tbody>
      </table>
    </div>
  );
  return null;
}

const stripNumber = (text: string) => text.replace(/^[一二三四五六七八九十]+、/, "");

export default async function GridIndustryPage() {
  await requireChatGPTUser("/grid-industry");
  const chapters = blocks.filter(b => b.level === 2).map(b => ({ id: b.id!, text: b.text! }));
  // Sidebar categories: the level-3 groups of whichever chapter holds the level-4 breakdown items.
  const firstItem = blocks.findIndex(b => b.level === 4);
  let breakdownStart = -1;
  for (let j = firstItem; j >= 0; j--) if (blocks[j].level === 2) { breakdownStart = j; break; }
  const breakdownEnd = blocks.findIndex((b, j) => j > breakdownStart && b.level === 2);
  const breakdown = breakdownStart < 0 ? [] : blocks.slice(breakdownStart, breakdownEnd < 0 ? undefined : breakdownEnd);
  const groups = breakdown.filter(b => b.level === 3);
  const categories = (groups.length ? groups : breakdown.filter(b => b.level === 4)).map(b => ({ id: b.id!, text: b.text! }));
  return (
    <ReadingShell chapters={chapters} categories={categories} categoryLabel={categories.length ? `应用拆解 · ${categories.length} 项` : ""}>
      <article className="oil-reading" aria-labelledby="reading-top">
        <header className="oil-intro">
          <div className="oil-eyebrow">产业研究 · POWER & GRID</div>
          <h1 id="reading-top" tabIndex={-1}>{blocks[0].text}</h1>
          <p className="oil-lead">从发电厂，到特高压与变电站，再到每一块电表、每一座数据中心。</p>
          <div className="oil-metrics" aria-label="内容规模">
            {reading.counts.companies > 0 && <span><b>{reading.counts.companies}</b> 家上市公司</span>}
            {reading.counts.routes > 0 && <span><b>{reading.counts.routes}</b> 条技术路线</span>}
            {reading.counts.applications > 0 && <span><b>{reading.counts.applications}</b> 项应用拆解</span>}
          </div>
          <nav className="oil-chapter-links" aria-label="章节快捷入口">
            {chapters.map((chapter, i) => <a key={chapter.id} href={`#${chapter.id}`}><span>0{i + 1}</span>{stripNumber(chapter.text)}</a>)}
          </nav>
        </header>
        {blocks.slice(1).map((block, i) => {
          const index = i + 1;
          const isChapter = block.level === 2;
          const nextChapter = blocks.findIndex((b, j) => j > index && b.level === 2);
          const subsections = isChapter ? blocks.slice(index + 1, nextChapter < 0 ? undefined : nextChapter).filter(b => b.level === 3) : [];
          if (isChapter && subsections.length === 0) subsections.push(...blocks.slice(index + 1, nextChapter < 0 ? undefined : nextChapter).filter(b => b.level === 4));
          return <Fragment key={index}>
            <ReadingBlock block={block} index={index} />
            {subsections.length > 0 && <details className="oil-section-index">
              <summary>本章索引 · {subsections.length} 个小节</summary>
              <nav aria-label={`${block.text}索引`}>{subsections.map(sub => <a key={sub.id} href={`#${sub.id}`}>{sub.text}</a>)}</nav>
            </details>}
          </Fragment>;
        })}
        <footer className="oil-reading-footer"><span>全文完{reading.researchDate ? ` · 研究资料截至 ${reading.researchDate}` : ""}</span><a href="#reading-top">返回开篇 ↑</a></footer>
      </article>
    </ReadingShell>
  );
}
