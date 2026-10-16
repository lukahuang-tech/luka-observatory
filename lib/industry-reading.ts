export type ReadingNoteReference = { id: string; returnId: string; title: string };
export type ReadingBlock = {
  kind: string; level?: number; text?: string; id?: string;
  items?: string[]; labels?: string[]; rows?: string[][];
  sourceIndex?: number;
  noteRefs?: ReadingNoteReference[];
  companyNotes?: ReadingNoteReference[];
};
export type ReadingNote = ReadingNoteReference & {
  group: "阅读说明" | "公司说明与来源" | "应用补充说明" | "市场讨论说明";
  blocks: ReadingBlock[];
};

// Keep the reviewed source and its anchors intact. Only these editorial forms
// move to endnotes; technical route explanations and claim qualifiers stay put.
const editorialParagraphs = [
  "每家公司列出", "这些是典型主要路线", "每项依次给出",
  "本段只作负荷侧样本", "以下是电网产业链的典型技术路线", "时间窗口为",
];
const noteItem = /^(?:\*\*)?(边界|覆盖度|覆盖局限|口径)(?:\*\*)?：/;

export function arrangeIndustryReading(source: ReadingBlock[]) {
  const start = source.findIndex(b => b.level === 2 && b.text === "一、公司清单");
  if (start < 0) throw new Error("Industry reading is missing its company chapter");
  const notes: ReadingNote[] = [{
    id: "note-overview", returnId: "reading-top", title: "阅读范围与产业链概览",
    group: "阅读说明", blocks: source.slice(1, start),
  }];
  const body: ReadingBlock[] = [];
  let section = source[start];
  let market = false;
  for (let index = start; index < source.length; index++) {
    const original = source[index];
    const block = { ...original, sourceIndex: index };
    if (block.kind === "heading") {
      section = block;
      if (block.level === 2) market = /市场讨论/.test(block.text ?? "");
      // This subsection consists solely of an editorial scope note.
      if (block.level === 3 && block.text === "终端需求样本｜数据中心、工业大用户" &&
        source[index + 1]?.kind === "paragraph" && source[index + 1].text?.startsWith("本段只作负荷侧样本")) {
        notes.push({ id: `note-${index}`, returnId: "reading-top", title: block.text,
          group: "阅读说明", blocks: [original, source[++index]] });
        continue;
      }
    }
    if ((block.kind === "paragraph" && editorialParagraphs.some(prefix => block.text?.startsWith(prefix))) ||
      (block.kind === "list" && block.items?.length && block.items.every(item => item.startsWith("财务数据来源：")))) {
      notes.push({ id: `note-${index}`, returnId: section.id!, title: section.text!,
        group: "阅读说明", blocks: [original] });
      continue;
    }
    if (block.kind === "companies") {
      block.companyNotes = block.rows!.map((row, rowIndex) => {
        const ref = { id: `note-company-${index}-${rowIndex}`, returnId: `company-${index}-${rowIndex}`,
          title: row[0].split("；")[0].replaceAll("**", "") };
        notes.push({ ...ref, group: "公司说明与来源", blocks: [{ kind: "paragraph", text: row[3] }] });
        return ref;
      });
      block.rows = block.rows!.map(row => row.slice(0, 3));
      block.labels = block.labels!.slice(0, 3);
    }
    if (block.kind === "list") {
      const supplemental = block.items!.filter(item => noteItem.test(item));
      if (supplemental.length) {
        const ref = { id: `note-${index}`, returnId: `note-ref-${index}`, title: section.text! };
        notes.push({ ...ref, group: market ? "市场讨论说明" : "应用补充说明",
          blocks: [{ kind: "list", items: supplemental }] });
        block.items = block.items!.filter(item => !noteItem.test(item));
        block.noteRefs = [ref];
      }
    }
    body.push(block);
  }
  return { body, notes };
}
