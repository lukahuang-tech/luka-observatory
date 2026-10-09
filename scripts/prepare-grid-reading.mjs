// Compile the reviewed grid reading document into server-rendered, structured content.
// Chapters are not fixed: every "## " heading becomes a chapter in document order.
// Only the Markdown forms used by this document are accepted; no raw HTML executes.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const input = new URL("../docs/grid-industry-reading.md", import.meta.url);
const output = new URL("../data/grid-industry-reading.json", import.meta.url);
const lines = readFileSync(input, "utf8").trim().split(/\r?\n/);
const blocks = [];
let headingIndex = 0;
let chapterIndex = 0;
for (let i = 0; i < lines.length;) {
  const line = lines[i];
  if (!line.trim()) { i++; continue; }
  const heading = line.match(/^(#{1,4}) (.+)$/);
  if (heading) {
    const level = heading[1].length;
    const text = heading[2].trim();
    const id = level === 1 ? "reading-top" : level === 2 ? `chapter-${++chapterIndex}` : `reading-${++headingIndex}`;
    blocks.push({ kind: "heading", level, text, id });
    i++; continue;
  }
  if (line.startsWith("|")) {
    const table = [];
    while (i < lines.length && lines[i].startsWith("|")) {
      table.push(lines[i++].trim().slice(1, -1).split("|").map(cell => cell.trim()));
    }
    const width = table[0].length;
    if (table.length < 3 || !/^:?-{3,}:?$/.test(table[1][0]) || table.slice(2).some(row => row.length !== width)) {
      throw new Error(`Malformed table (near: ${table[0].join(" | ")})`);
    }
    // A 4-column table whose first header names the company renders as company cards;
    // any other table (e.g. financials) renders as a plain data table.
    const isCompanies = width === 4 && /公司/.test(table[0][0]);
    blocks.push({ kind: isCompanies ? "companies" : "table", labels: table[0], rows: table.slice(2) });
    continue;
  }
  if (line.startsWith("- ")) {
    const items = [];
    while (i < lines.length && lines[i].startsWith("- ")) items.push(lines[i++].slice(2));
    blocks.push({ kind: "list", items });
    continue;
  }
  if (/^[#|<>`]|^\s+- /.test(line)) throw new Error(`Unsupported reading syntax: ${line}`);
  const paragraph = [];
  while (i < lines.length && lines[i].trim() && !/^(#{1,4} |\||- )/.test(lines[i])) {
    paragraph.push(lines[i++]);
  }
  blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
}
if (blocks[0]?.id !== "reading-top") throw new Error("Document must start with a single '# ' title");
const counts = {
  chapters: chapterIndex,
  companies: blocks.filter(b => b.kind === "companies").reduce((n, b) => n + b.rows.length, 0),
  routes: blocks.filter(b => b.kind === "heading" && b.level === 3 && /^G\d{2} /.test(b.text)).length,
  // Breakdown items: level-4 headings in the first chapter that has any (later chapters
  // may also use level 4, e.g. a market-discussion chapter, and must not inflate this).
  applications: (() => {
    const first = blocks.findIndex(b => b.level === 4);
    if (first < 0) return 0;
    let start = first; while (start > 0 && blocks[start].level !== 2) start--;
    const end = blocks.findIndex((b, j) => j > start && b.level === 2);
    return blocks.slice(start, end < 0 ? undefined : end).filter(b => b.level === 4).length;
  })(),
};
// Optional lock: node scripts/prepare-grid-reading.mjs --expect '{"companies":40,...}'
const expectArg = process.argv[process.argv.indexOf("--expect") + 1];
if (process.argv.includes("--expect")) {
  const expected = JSON.parse(expectArg);
  for (const [k, v] of Object.entries(expected)) {
    if (counts[k] !== v) throw new Error(`Unexpected reading counts: ${JSON.stringify(counts)}`);
  }
}
const researchDate = (lines.find(l => /^研究日期/.test(l))?.match(/\d{4}-\d{2}-\d{2}(?!.*\d{4}-\d{2}-\d{2})/) ?? [""])[0];
const serialized = JSON.stringify({ researchDate, counts, blocks }, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8") !== serialized) throw new Error("Regenerate grid reading data");
} else writeFileSync(output, serialized);
console.log(`Grid reading compiled: ${JSON.stringify(counts)} (${fileURLToPath(output)})`);
