import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { messageId, planTurn, runReadOnly } from "./agent";
import { formatFigureEmbed, rewriteWikilinks, type FigureMotion, type FigureSize } from "./markdown";
import { findNote, findNoteLoose } from "./retrieve";
import { seedCells, seedNotes } from "./seed";
import type { SavedIdea } from "@/figures/idea/schema";
import { ideaSlug } from "@/figures/idea/schema";
import type { BoardSticker, CanvasPos, ChatMessage, ConfirmState, Note, NoteDraft, NotebookCell, WorkspaceView, WriteMode } from "./types";

type Theme = "light" | "dark";

type FabricJob = { assistantId: string; patternId: string; source: string; started: boolean } | null;

type VaultState = {
  notes: Note[];
  stickers: BoardSticker[];
  ideas: SavedIdea[];
  ideaOpen: boolean;
  cells: NotebookCell[];
  messages: ChatMessage[];
  activeId: string;
  theme: Theme;
  mode: WriteMode;
  view: WorkspaceView;
  sidebarOpen: boolean;
  focusMode: boolean;
  query: string;
  paletteOpen: boolean;
  confirm: ConfirmState;
  focusTick: number;
  pendingPrompt: string;
  fabricJob: FabricJob;
  setQuery: (query: string) => void;
  setView: (view: WorkspaceView) => void;
  setMode: (mode: WriteMode) => void;
  cycleMode: () => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setSidebar: (open: boolean) => void;
  setFocus: (on: boolean) => void;
  setPalette: (open: boolean) => void;
  setConfirm: (confirm: ConfirmState) => void;
  select: (id: string) => void;
  createNote: (partial?: { title?: string; body?: string }) => void;
  updateBody: (id: string, body: string) => void;
  insertFigure: (slug: string, options?: { size?: FigureSize; motion?: FigureMotion; tilt?: number }) => void;
  placeSticker: (sticker: { slug: string; animated?: boolean; tilt?: number }) => void;
  moveSticker: (id: string, x: number, y: number) => void;
  removeSticker: (id: string) => void;
  setIdeaOpen: (open: boolean) => void;
  saveIdea: (idea: Omit<SavedIdea, "slug"> & { slug?: string }) => string;
  renameIdea: (slug: string, title: string, nextSlug: string) => void;
  deleteIdea: (slug: string) => void;
  updateTitle: (id: string, title: string) => void;
  commitRename: (id: string, from: string, to: string) => void;
  deleteNote: (id: string) => void;
  placeOnCanvas: (id: string) => void;
  moveCanvas: (id: string, x: number, y: number) => void;
  updateCell: (id: string, code: string) => void;
  addCell: () => void;
  removeCell: (id: string) => void;
  openWiki: (title: string) => void;
  ask: (text: string) => void;
  resolveFabric: (id: string, outcome: { content: string; draft: NoteDraft; pattern: string } | { error: string }) => void;
  preparePattern: (id: string) => void;
  approve: (id: string) => void;
  refuse: (id: string) => void;
  resetVault: () => void;
};

function storage() {
  const memory = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { name: string; value: string } | null = null;
  const flush = () => {
    if (!pending || typeof window === "undefined") return;
    try {
      localStorage.setItem(pending.name, pending.value);
    } catch {
      /* quota cheia: a sessão em memória continua */
    }
    pending = null;
  };
  if (typeof window !== "undefined") window.addEventListener("pagehide", flush);
  return {
    getItem: (name: string) => {
      if (typeof window === "undefined") return memory.get(name) ?? null;
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name: string, value: string) => {
      if (typeof window === "undefined") {
        memory.set(name, value);
        return;
      }
      pending = { name, value };
      clearTimeout(timer);
      timer = setTimeout(flush, 200);
    },
    removeItem: (name: string) => {
      if (typeof window === "undefined") memory.delete(name);
      else localStorage.removeItem(name);
    },
  };
}

function spot(notes: Note[]): CanvasPos {
  const count = notes.filter((note) => note.canvas).length;
  const column = count % 3;
  const row = Math.floor(count / 3);
  return { x: 48 + column * 340, y: 48 + row * 240, w: 280, h: 170 };
}

function blank(title: string, body: string): Note {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: title.trim() || "Sem título",
    body,
    createdAt: now,
    updatedAt: now,
  };
}

const modes: WriteMode[] = ["source", "blocks", "read"];

const initialNotes = seedNotes();

export const useVault = create<VaultState>()(
  persist(
    (set, get) => ({
      notes: initialNotes,
      stickers: [],
      ideas: [],
      ideaOpen: false,
      cells: seedCells(),
      messages: [],
      activeId: "n-routine",
      theme: "light",
      mode: "source",
      view: "notes",
      sidebarOpen: true,
      focusMode: false,
      query: "",
      paletteOpen: false,
      confirm: null,
      focusTick: 0,
      pendingPrompt: "",
      fabricJob: null,
      setQuery: (query) => set({ query }),
      setView: (view) => set({ view, focusMode: view === "notes" ? get().focusMode : false }),
      setMode: (mode) => set({ mode }),
      cycleMode: () => {
        const current = modes.indexOf(get().mode);
        const next = modes[(current + 1) % modes.length] ?? "source";
        set({ mode: next, view: "notes" });
      },
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      setSidebar: (sidebarOpen) => set({ sidebarOpen }),
      setFocus: (focusMode) => {
        const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
        set({
          focusMode,
          view: focusMode ? "notes" : get().view,
          sidebarOpen: focusMode ? false : wide,
        });
      },
      setPalette: (paletteOpen) => set({ paletteOpen }),
      setConfirm: (confirm) => set({ confirm }),
      select: (id) => set({ activeId: id, view: "notes" }),
      createNote: (partial) => {
        const note = blank(partial?.title ?? "Sem título", partial?.body ?? "");
        set({
          notes: [note, ...get().notes],
          activeId: note.id,
          view: "notes",
          mode: "source",
          focusMode: false,
          focusTick: get().focusTick + 1,
          query: "",
        });
      },
      updateBody: (id, body) =>
        set({
          notes: get().notes.map((note) => (note.id === id ? { ...note, body, updatedAt: Date.now() } : note)),
        }),
      insertFigure: (slug, options) => {
        const line = formatFigureEmbed({ slug, ...options });
        const state = get();
        const note = state.notes.find((item) => item.id === state.activeId);
        if (!note) {
          const created = blank("Figura", `${line}\n`);
          set({ notes: [created, ...state.notes], activeId: created.id, view: "notes", mode: "read", paletteOpen: false });
          return;
        }
        const body = note.body.includes(line) ? note.body : `${note.body.trim()}\n\n${line}\n`;
        set({
          notes: state.notes.map((item) => (item.id === note.id ? { ...item, body, updatedAt: Date.now() } : item)),
          view: "notes",
          mode: "read",
          paletteOpen: false,
        });
      },
      placeSticker: ({ slug, animated = true, tilt }) => {
        const list = get().stickers ?? [];
        const placedNotes = get().notes.filter((note) => note.canvas);
        const right = placedNotes.reduce((max, note) => Math.max(max, (note.canvas?.x ?? 0) + (note.canvas?.w ?? 0)), 48);
        const top = placedNotes.reduce((min, note) => Math.min(min, note.canvas?.y ?? 80), 80);
        const placed: BoardSticker = {
          id: crypto.randomUUID(),
          slug,
          x: right + 28,
          y: top + list.length * 36,
          tilt: tilt ?? ((list.length % 5) - 2) * 1.5,
          animated,
        };
        set({ stickers: [...list, placed], view: "canvas" });
      },
      moveSticker: (id, x, y) =>
        set({
          stickers: (get().stickers ?? []).map((sticker) => (sticker.id === id ? { ...sticker, x, y } : sticker)),
        }),
      removeSticker: (id) => set({ stickers: (get().stickers ?? []).filter((sticker) => sticker.id !== id) }),
      setIdeaOpen: (ideaOpen) => set({ ideaOpen }),
      saveIdea: (idea) => {
        const ideas = get().ideas ?? [];
        const slug = ideaSlug(idea.slug || idea.name || idea.title, ideas.map((item) => item.slug));
        const saved: SavedIdea = { ...idea, name: idea.name || idea.title, slug };
        set({ ideas: [...ideas, saved] });
        get().insertFigure(slug);
        return slug;
      },
      renameIdea: (slug, title, nextSlug) => {
        const clean = ideaSlug(nextSlug.replace(/^ideia-/, ""), (get().ideas ?? []).filter((item) => item.slug !== slug).map((item) => item.slug));
        const target = clean === slug ? slug : clean;
        set({
          ideas: (get().ideas ?? []).map((item) => (item.slug === slug ? { ...item, title: title.trim() || item.title, slug: target } : item)),
          stickers: (get().stickers ?? []).map((sticker) => (sticker.slug === slug ? { ...sticker, slug: target } : sticker)),
          notes: get().notes.map((note) => ({
            ...note,
            body: note.body.replace(new RegExp(`!\\[\\[figure:${slug}(?=[|\\]])`, "g"), `![[figure:${target}`),
          })),
        });
      },
      deleteIdea: (slug) =>
        set({
          ideas: (get().ideas ?? []).filter((item) => item.slug !== slug),
          stickers: (get().stickers ?? []).filter((sticker) => sticker.slug !== slug),
        }),
      updateTitle: (id, title) =>
        set({
          notes: get().notes.map((note) => (note.id === id ? { ...note, title } : note)),
        }),
      commitRename: (id, from, to) => {
        const next = to.trim();
        const prev = from.trim();
        if (!next || next.toLowerCase() === prev.toLowerCase()) {
          set({
            notes: get().notes.map((note) => (note.id === id ? { ...note, title: next || prev || "Sem título" } : note)),
          });
          return;
        }
        set({
          notes: get().notes.map((note) => ({
            ...note,
            title: note.id === id ? next : note.title,
            body: rewriteWikilinks(note.body, prev, next),
            updatedAt: note.id === id || note.body !== rewriteWikilinks(note.body, prev, next) ? Date.now() : note.updatedAt,
          })),
        });
      },
      deleteNote: (id) => {
        const notes = get().notes.filter((note) => note.id !== id);
        const activeId = get().activeId === id ? (notes[0]?.id ?? "") : get().activeId;
        set({ notes, activeId, confirm: null });
      },
      placeOnCanvas: (id) => {
        const notes = get().notes.map((note) => (note.id === id && !note.canvas ? { ...note, canvas: spot(get().notes), updatedAt: Date.now() } : note));
        set({ notes, view: "canvas" });
      },
      moveCanvas: (id, x, y) =>
        set({
          notes: get().notes.map((note) => (note.id === id && note.canvas ? { ...note, canvas: { ...note.canvas, x, y } } : note)),
        }),
      updateCell: (id, code) => set({ cells: get().cells.map((cell) => (cell.id === id ? { ...cell, code } : cell)) }),
      addCell: () => set({ cells: [...get().cells, { id: crypto.randomUUID(), code: "" }] }),
      removeCell: (id) => set({ cells: get().cells.filter((cell) => cell.id !== id) }),
      openWiki: (title) => {
        const found = findNote(get().notes, title);
        if (found) {
          set({ activeId: found.id, view: "notes" });
          return;
        }
        const note = blank(title, "");
        set({
          notes: [note, ...get().notes],
          activeId: note.id,
          view: "notes",
          mode: "source",
          focusTick: get().focusTick + 1,
        });
      },
      ask: (text) => {
        const state = get();
        const active = state.notes.find((note) => note.id === state.activeId);
        const plan = planTurn(text, state.notes, active);
        const user: ChatMessage = { id: messageId(), role: "user", content: text.trim() };
        if (plan.kind === "fabric") {
          const assistantId = messageId();
          const assistant: ChatMessage = {
            id: assistantId,
            role: "assistant",
            content: `Lendo a fonte com \`${plan.patternId}\`. O cofre não foi alterado.`,
          };
          set({
            messages: [...state.messages, user, assistant].slice(-40),
            view: "atlas",
            fabricJob: { assistantId, patternId: plan.patternId, source: plan.source, started: false },
          });
          return;
        }
        let assistant: ChatMessage;
        if (plan.kind === "reply") {
          assistant = { id: messageId(), role: "assistant", content: plan.content };
        } else if (plan.kind === "search") {
          const outcome = runReadOnly("vault.search", { query: plan.query }, state.notes, state.cells);
          assistant = {
            id: messageId(),
            role: "assistant",
            content: outcome.content,
            citations: outcome.citations,
            trace: { name: "vault.search", readOnly: true, args: { query: plan.query }, status: "done", result: outcome.result },
          };
        } else if (plan.readOnly) {
          const outcome = runReadOnly(plan.name, plan.args, state.notes, state.cells);
          assistant = {
            id: messageId(),
            role: "assistant",
            content: outcome.content,
            citations: outcome.citations,
            trace: { name: plan.name, readOnly: true, args: plan.args, status: "done", result: outcome.result },
          };
        } else {
          assistant = {
            id: messageId(),
            role: "assistant",
            content: plan.preview,
            trace: { name: plan.name, readOnly: false, args: plan.args, status: "pending" },
          };
        }
        set({ messages: [...state.messages, user, assistant].slice(-40), view: "atlas", fabricJob: null });
      },
      resolveFabric: (id, outcome) => {
        const state = get();
        const job = state.fabricJob;
        set({
          fabricJob: job?.assistantId === id ? null : job,
          messages: state.messages.map((item) => {
            if (item.id !== id || item.trace) return item;
            if ("error" in outcome) return { ...item, content: outcome.error };
            return {
              ...item,
              content: outcome.content,
              draft: outcome.draft,
              trace: {
                name: "fabric.capture",
                readOnly: false,
                args: {
                  pattern: "pattern" in outcome ? outcome.pattern : "",
                  title: outcome.draft.title,
                  concepts: String(outcome.draft.concepts.length),
                  notebook: String(outcome.draft.cells.length),
                  canvas: outcome.draft.canvas ? "sim" : "não",
                },
                status: "pending",
              },
            };
          }),
        });
      },
      preparePattern: (id) => set({ pendingPrompt: `${id}\n`, view: "atlas", paletteOpen: false, focusMode: false }),
      approve: (id) => {
        const state = get();
        const message = state.messages.find((item) => item.id === id);
        const trace = message?.trace;
        if (!trace || trace.status !== "pending") return;
        let notes = state.notes;
        let cells = state.cells;
        let activeId = state.activeId;
        let view = state.view;
        let result = "Nada foi alterado.";
        if (trace.name === "vault.create") {
          const note = blank(trace.args.title ?? "Sem título", trace.args.body ?? "");
          notes = [note, ...notes];
          activeId = note.id;
          view = "notes";
          result = `Nota criada: ${note.title}`;
        } else if (trace.name === "vault.append") {
          const target = findNoteLoose(notes, trace.args.title ?? "");
          if (!target) result = "Nota não encontrada. Nada foi escrito.";
          else {
            notes = notes.map((note) =>
              note.id === target.id ? { ...note, body: `${note.body.trim()}\n\n${trace.args.text ?? ""}\n`, updatedAt: Date.now() } : note,
            );
            activeId = target.id;
            result = `Texto acrescentado em ${target.title}.`;
          }
        } else if (trace.name === "canvas.place") {
          const target = findNoteLoose(notes, trace.args.title ?? "");
          if (!target) result = "Nota não encontrada.";
          else if (target.canvas) result = `${target.title} já estava no canvas.`;
          else {
            notes = notes.map((note) => (note.id === target.id ? { ...note, canvas: spot(notes), updatedAt: Date.now() } : note));
            view = "canvas";
            activeId = target.id;
            result = `${target.title} entrou no canvas.`;
          }
        } else if (trace.name === "fabric.capture" && message?.draft) {
          const draft = message.draft;
          const concepts = Array.isArray(draft.concepts) ? draft.concepts : [];
          const extraCells = Array.isArray(draft.cells) ? draft.cells : [];
          const created: Note[] = [];
          const main = blank(draft.title, draft.body);
          if (draft.canvas) main.canvas = spot([...notes, ...created]);
          created.push(main);
          for (const concept of concepts) {
            if (!concept?.title || findNoteLoose([...notes, ...created], concept.title)) continue;
            const note = blank(concept.title, concept.body);
            if (draft.canvas) note.canvas = spot([...notes, ...created]);
            created.push(note);
          }
          notes = [...created, ...notes];
          if (extraCells.length) cells = [...cells, ...extraCells.map((code) => ({ id: crypto.randomUUID(), code }))];
          activeId = main.id;
          view = "notes";
          const extras = created.length - 1;
          result = `Gravado: ${main.title}.${extras ? ` ${extras} conceitos novos.` : ""}${extraCells.length ? ` ${extraCells.length} células no caderno.` : ""}${draft.canvas ? " Cartões no canvas." : ""}`;
        } else if (trace.name === "fabric.capture") {
          result = "A pré-visualização expirou. Nada foi escrito.";
        }
        set({
          notes,
          cells,
          activeId,
          view,
          messages: state.messages.map((item) =>
            item.id === id && item.trace ? { ...item, trace: { ...item.trace, status: "done", result } } : item,
          ),
        });
      },
      refuse: (id) =>
        set({
          messages: get().messages.map((item) =>
            item.id === id && item.trace
              ? { ...item, trace: { ...item.trace, status: "refused", result: "Recusado. Nada foi escrito." } }
              : item,
          ),
        }),
      resetVault: () => {
        const notes = seedNotes();
        set({
          notes,
          stickers: [],
          cells: seedCells(),
          messages: [],
          activeId: "n-routine",
          mode: "source",
          view: "notes",
          confirm: null,
          query: "",
          fabricJob: null,
          pendingPrompt: "",
        });
      },
    }),
    {
      name: "locus-vault-v1",
      storage: createJSONStorage(storage),
      skipHydration: true,
      partialize: (state) => ({
        notes: state.notes,
        stickers: state.stickers,
        ideas: state.ideas,
        cells: state.cells,
        messages: state.messages,
        activeId: state.activeId,
        theme: state.theme,
        mode: state.mode,
        view: state.view,
        sidebarOpen: state.sidebarOpen,
        focusMode: state.focusMode,
      }),
    },
  ),
);
