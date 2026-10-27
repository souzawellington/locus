import { wikilinkTitles } from "../../lib/vault/markdown.ts";
import { findNote } from "../../lib/vault/retrieve.ts";
import type { Note, OpenNote } from "../../lib/vault/types.ts";
import type { FigureRac } from "./prompt.ts";

const EXCERPT = 700;
const SUMMARY = 240;
const LINKS = 4;

function openBody(note: Note, openNotes: Record<string, OpenNote>): string {
  if (note.seal) return "";
  return openNotes[note.id]?.body ?? note.body;
}

/** Notes with a seal stay out, even when the text is open on this device. */
export function buildFigureRac(
  notes: Note[],
  openNotes: Record<string, OpenNote>,
  activeId: string,
  preferredTheme: string,
): FigureRac {
  const active = notes.find((note) => note.id === activeId);
  if (!active || active.seal) {
    return {
      activeNoteTitle: "",
      activeNoteExcerpt: "",
      linkedNotesSummary: [],
      preferredTheme: preferredTheme.slice(0, 32),
    };
  }
  const body = openBody(active, openNotes);
  const linked: string[] = [];
  for (const title of wikilinkTitles(body)) {
    const note = findNote(notes, title);
    if (!note || note.seal || note.id === active.id) continue;
    const text = openBody(note, openNotes).replace(/\s+/g, " ").trim().slice(0, SUMMARY);
    if (!text) continue;
    linked.push(`${note.title}: ${text}`);
    if (linked.length >= LINKS) break;
  }
  return {
    activeNoteTitle: active.title.replace(/\s+/g, " ").trim().slice(0, 80),
    activeNoteExcerpt: body.replace(/\s+/g, " ").trim().slice(0, EXCERPT),
    linkedNotesSummary: linked,
    preferredTheme: preferredTheme.slice(0, 32) || "paper",
  };
}
