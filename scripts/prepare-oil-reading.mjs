// Compile the reviewed reading document into server-rendered, structured content.
// Only the Markdown forms used by this document are accepted; no raw HTML executes.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const input = new URL("../docs/oil-industry-reading.md", import.meta.url);
const output = new URL("../data/oil-industry-reading.json", import.meta.url);
const lines = readFileSync(input, "utf8").trim().split(/\r?\n/);
const blocks = [];
let headingIndex = 0;
for (let i = 0; i < lines.length;) {
  const line = lines[i];
  if (!line.trim()) { i++; continue; }
  const heading = line.match(/^(#{1,4}) (.+)$/);
  if (heading) {
    const level = heading[1].length;
    const text = heading[2];
    const id = level === 1 ? "reading-top" :
      ({ "如何理解产业链": "overview", "一、公司清单": "companies",
        "二、从原料到材料": "routes", "三、逐个商品部件拆解": "applications" })[text]
        ?? `reading-${++headingIndex}`;
    blocks.push({ kind: "heading", level, text, id });
    i++; continue;
  }
  if (line.startsWith("|")) {
    const table = [];
    while (i < lines.length && lines[i].startsWith("|")) {
      table.push(lines[i++].slice(1, -1).split("|").map(cell => cell.trim()));
    }
    if (table[0].length !== 4 || table.slice(2).some(row => row.length !== 4)) {
      throw new Error("Unexpected company table format");
    }
    blocks.push({ kind: "companies", labels: table[0], rows: table.slice(2) });
    continue;
  }
  if (line.startsWith("- ")) {
    const items = [];
    while (i < lines.length && lines[i].startsWith("- ")) items.push(lines[i++].slice(2));
    blocks.push({ kind: "list", items });
    continue;
  }
  if (/^[#|<>`]/.test(line)) throw new Error(`Unsupported reading syntax: ${line}`);
  const paragraph = [];
  while (i < lines.length && lines[i].trim() && !/^(#{1,4} |\||- )/.test(lines[i])) {
    paragraph.push(lines[i++]);
  }
  blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
}
const counts = {
  companies: blocks.filter(b => b.kind === "companies").reduce((n, b) => n + b.rows.length, 0),
  routes: blocks.filter(b => b.kind === "heading" && /^R\d{2} /.test(b.text)).length,
  applications: blocks.filter(b => b.kind === "heading" && b.level === 4).length,
};
if (counts.companies !== 60 || counts.routes !== 28 || counts.applications !== 88) {
  throw new Error(`Unexpected reading counts: ${JSON.stringify(counts)}`);
}
const serialized = JSON.stringify({ researchDate: "2026-10-08", counts, blocks }, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8") !== serialized) throw new Error("Regenerate oil reading data");
} else writeFileSync(output, serialized);
console.log(`Full reading content verified: ${JSON.stringify(counts)} (${fileURLToPath(output)})`);
