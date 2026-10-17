import type { ReactNode } from "react";
import type { ReadingBlock, ReadingNote, ReadingNoteReference } from "@/lib/industry-reading";

export function NoteLink({ note, label = "补充说明" }: { note: ReadingNoteReference; label?: string }) {
  return <a className="oil-note-link" id={note.returnId.startsWith("note-ref-") ? note.returnId : undefined}
    href={`#${note.id}`} aria-label={`${note.title}：${label}`}>{label} ↓</a>;
}

export function ReadingEndnotes({ notes, renderBlock }: {
  notes: ReadingNote[]; renderBlock: (block: ReadingBlock, index: number) => ReactNode;
}) {
  const groups = [...new Set(notes.map(note => note.group))];
  return <aside className="oil-endnotes" aria-labelledby="reading-notes">
    <h2 id="reading-notes" tabIndex={-1}>补充说明</h2>
    <nav className="oil-endnote-index" aria-label="补充说明分类">
      {groups.map((group, index) => <a key={group} href={`#note-group-${index}`}>{group}</a>)}
    </nav>
    {groups.map((group, groupIndex) => <section key={group} aria-labelledby={`note-group-${groupIndex}`}>
      <h3 id={`note-group-${groupIndex}`} tabIndex={-1}>{group}</h3>
      {notes.filter(note => note.group === group).map(note => <div className="oil-endnote" key={note.id} id={note.id} tabIndex={-1}>
        <p className="oil-endnote-title"><strong>{note.title}</strong><a href={`#${note.returnId}`} aria-label={`返回${note.title}`}>返回正文 ↑</a></p>
        {note.blocks.map((block, index) => renderBlock(block.kind === "heading" ? { ...block, level: 4 } : block, index))}
      </div>)}
    </section>)}
  </aside>;
}
