import assert from "node:assert/strict";
import { test } from "node:test";
import { noteIsLocked } from "../../lib/vault/seal.ts";
import type { Note, NoteSeal, OpenNote } from "../../lib/vault/types.ts";
import { buildFigureRac } from "./context.ts";
import { buildFigureCompilationPrompt } from "./prompt.ts";

const seal: NoteSeal = { salt: "aa", iv: "bb", data: "cc", hideTitle: false, iterations: 1 };

function note(partial: Partial<Note> & Pick<Note, "id" | "title" | "body">): Note {
  return { createdAt: 1, updatedAt: 1, ...partial };
}

test("sealed notes stay out of the figure request even when they are open", () => {
  const secret = "SEGREDO-TRANCADO-QUE-NAO-PODE-SAIR-DA-NOTA";
  const notes = [
    note({ id: "open", title: "Bancada", body: "A haste mede 40 mm. Ver [[Cofre]] e [[Livre]]." }),
    note({ id: "locked", title: "Cofre", body: "", seal }),
    note({ id: "free", title: "Livre", body: "O trilho mede 64 mm nesta nota livre." }),
  ];
  const openNotes: Record<string, OpenNote> = {
    locked: { title: "Cofre", body: secret, ink: [] },
    open: { title: "Bancada", body: notes[0]?.body ?? "", ink: [] },
  };
  const rac = buildFigureRac(notes, openNotes, "open", "light");
  assert.equal(rac.activeNoteExcerpt.includes(secret), false);
  assert.equal(rac.linkedNotesSummary.some((line) => line.includes(secret)), false);
  assert.equal(rac.linkedNotesSummary.some((line) => line.includes("64 mm")), true);
  const lockedActive = buildFigureRac(notes, { locked: { title: "Cofre", body: secret, ink: [] } }, "locked", "light");
  assert.equal(noteIsLocked(notes[1]), true);
  assert.equal(lockedActive.activeNoteExcerpt, "");
  assert.deepEqual(lockedActive.linkedNotesSummary, []);
  assert.equal(JSON.stringify(lockedActive).includes(secret), false);
  const prompt = buildFigureCompilationPrompt("uma bancada", lockedActive);
  assert.equal(prompt.user.includes(secret), false);
  assert.equal(prompt.system.includes(secret), false);
  const openPrompt = buildFigureCompilationPrompt("uma bancada", rac);
  assert.equal(openPrompt.user.includes(secret), false);
});
