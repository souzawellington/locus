import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { readInk } from "./appearance";
import { askAtlas, atlasReady } from "./atlas-ask";
import { consultAtlas, resolveAtlasTurn, selectFragments, type AtlasOutcome } from "./atlas";
import { messageId, planTurn, runReadOnly } from "./agent";
import { recryptMedia } from "@/lib/media/db";
import {
  formatFigureEmbed,
  mediaIds,
  rewriteWikilinks,
  type FigureMotion,
  type FigureSize,
} from "./markdown";
import { findNote, findNoteLoose, presentNotes } from "./retrieve";
import { seedCells, seedNotes } from "./seed";
import type { SavedIdea } from "@/figures/idea/schema";
import { ideaSlug } from "@/figures/idea/schema";
import {
  createPinRecord,
  encryptWithKey,
  forgetAllKeys,
  forgetDevicePin,
  forgetKey,
  openText,
  readPinRecord,
  rememberDevicePin,
  rememberKey,
  sealText,
  sessionKey,
  writePinRecord,
} from "./seal";
import type {
  BoardSticker,
  CanvasPos,
  ChatMessage,
  ConfirmState,
  InkStroke,
  Note,
  NoteColor,
  NoteDraft,
  NoteFont,
  NotebookCell,
  OpenNote,
  WorkspaceView,
  WriteMode,
} from "./types";

type Theme = "light" | "dark";

type FabricJob = {
  assistantId: string;
  patternId: string;
  source: string;
  started: boolean;
} | null;

type VaultState = {
  notes: Note[];
  stickers: BoardSticker[];
  ideas: SavedIdea[];
  ideaOpen: boolean;
  openNotes: Record<string, OpenNote>;
  sourceChosen: boolean;
  placeSuggest: boolean;
  placeAlerts: boolean;
  setPlaceSuggest: (on: boolean) => void;
  setPlaceAlerts: (on: boolean) => void;
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
  atlasPending: boolean;
  setQuery: (query: string) => void;
  setView: (view: WorkspaceView) => void;
  setMode: (mode: WriteMode) => void;
  setSourceChosen: (on: boolean) => void;
  hasDevicePin: boolean;
  setDevicePin: (pin: string) => Promise<void>;
  clearDevicePin: () => void;
  ensureNote: (title: string) => string;
  lockNote: (id: string, password: string, hideTitle: boolean) => Promise<void>;
  unlockNote: (id: string, password: string) => Promise<boolean>;
  unlockAllNow: () => void;
  removeSeal: (id: string) => Promise<void>;
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
  insertFigure: (
    slug: string,
    options?: { size?: FigureSize; motion?: FigureMotion; tilt?: number },
  ) => void;
  placeSticker: (sticker: { slug: string; animated?: boolean; tilt?: number }) => void;
  moveSticker: (id: string, x: number, y: number) => void;
  removeSticker: (id: string) => void;
  setIdeaOpen: (open: boolean) => void;
  saveIdea: (idea: Omit<SavedIdea, "slug"> & { slug?: string }) => string;
  renameIdea: (slug: string, title: string, nextSlug: string) => void;
  deleteIdea: (slug: string) => void;
  updateTitle: (id: string, title: string) => void;
  setLook: (id: string, look: { color?: NoteColor; font?: NoteFont }) => void;
  setInk: (id: string, ink: InkStroke[]) => void;
  commitRename: (id: string, from: string, to: string) => void;
  deleteNote: (id: string) => void;
  placeOnCanvas: (id: string) => void;
  moveCanvas: (id: string, x: number, y: number) => void;
  updateCell: (id: string, code: string) => void;
  addCell: () => void;
  removeCell: (id: string) => void;
  openWiki: (title: string) => void;
  ask: (text: string) => void;
  resolveFabric: (
    id: string,
    outcome: { content: string; draft: NoteDraft; pattern: string } | { error: string },
  ) => void;
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
    color: "white",
    font: "plex",
    createdAt: now,
    updatedAt: now,
  };
}

const modes: WriteMode[] = ["visual", "read"];

const sealTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleSeal(
  id: string,
  open: OpenNote,
  write: (id: string, sealPatch: { iv: string; data: string }) => void,
) {
  const pending = sealTimers.get(id);
  if (pending) clearTimeout(pending);
  sealTimers.set(
    id,
    setTimeout(() => {
      const key = sessionKey(id);
      if (!key) return;
      void encryptWithKey(
        key,
        JSON.stringify({ title: open.title, body: open.body, ink: open.ink ?? [] }),
      ).then((packed) => write(id, packed));
    }, 400),
  );
}

const initialNotes = seedNotes();

let atlasFlight = 0;

export const useVault = create<VaultState>()(
  persist(
    (set, get) => ({
      notes: initialNotes,
      stickers: [],
      ideas: [],
      ideaOpen: false,
      openNotes: {},
      sourceChosen: false,
      placeSuggest: true,
      placeAlerts: true,
      hasDevicePin: typeof localStorage !== "undefined" && readPinRecord() !== null,
      cells: seedCells(),
      messages: [],
      activeId: "n-today",
      theme: "light",
      mode: "visual",
      view: "notes",
      sidebarOpen: true,
      focusMode: false,
      query: "",
      paletteOpen: false,
      confirm: null,
      focusTick: 0,
      pendingPrompt: "",
      fabricJob: null,
      atlasPending: false,
      setQuery: (query) => set({ query }),
      setView: (view) => set({ view, focusMode: view === "notes" ? get().focusMode : false }),
      setMode: (mode) => set({ mode }),
      setSourceChosen: (sourceChosen) =>
        set({ sourceChosen, mode: sourceChosen ? "source" : "visual" }),
      setPlaceSuggest: (placeSuggest) => set({ placeSuggest }),
      setPlaceAlerts: (placeAlerts) => set({ placeAlerts }),
      setDevicePin: async (pin) => {
        writePinRecord(await createPinRecord(pin));
        rememberDevicePin(pin);
        set({ hasDevicePin: true });
      },
      clearDevicePin: () => {
        writePinRecord(null);
        forgetDevicePin();
        set({ hasDevicePin: false });
      },
      ensureNote: (title) => {
        const clean = title.trim() || "Sem título";
        const found = findNote(get().notes, clean);
        if (found) return found.id;
        const note = blank(clean, "");
        set({ notes: [note, ...get().notes] });
        return note.id;
      },
      lockNote: async (id, password, hideTitle) => {
        const state = get();
        const note = state.notes.find((item) => item.id === id);
        if (!note) return;
        const open = state.openNotes[id];
        const title = open?.title || note.title;
        const body = open?.body ?? (note.seal ? "" : note.body);
        const ink = open?.ink ?? (note.seal ? [] : (note.ink ?? []));
        const previous = sessionKey(id);
        const { seal, key } = await sealText(JSON.stringify({ title, body, ink }), password);
        seal.hideTitle = hideTitle;
        await recryptMedia(mediaIds(body), previous, key);
        const { [id]: _drop, ...rest } = state.openNotes;
        forgetKey(id);
        set({
          openNotes: rest,
          notes: get().notes.map((item) =>
            item.id === id
              ? {
                  ...item,
                  body: "",
                  ink: [],
                  title: hideTitle ? "Nota trancada" : title,
                  seal,
                  updatedAt: Date.now(),
                }
              : item,
          ),
        });
      },
      unlockNote: async (id, password) => {
        const note = get().notes.find((item) => item.id === id);
        if (!note?.seal) return true;
        try {
          const { plain, key } = await openText(note.seal, password);
          const parsed = JSON.parse(plain) as { title?: string; body?: string; ink?: unknown };
          rememberKey(id, key);
          set({
            openNotes: {
              ...get().openNotes,
              [id]: {
                title: parsed.title || note.title,
                body: parsed.body ?? "",
                ink: readInk(parsed.ink),
              },
            },
          });
          return true;
        } catch {
          return false;
        }
      },
      unlockAllNow: () => {
        forgetAllKeys();
        set({ openNotes: {} });
      },
      removeSeal: async (id) => {
        const open = get().openNotes[id];
        const note = get().notes.find((item) => item.id === id);
        if (!note) return;
        const key = sessionKey(id);
        if (key && open) await recryptMedia(mediaIds(open.body), key, undefined);
        const { [id]: _drop, ...rest } = get().openNotes;
        forgetKey(id);
        set({
          openNotes: rest,
          notes: get().notes.map((item) =>
            item.id === id
              ? {
                  ...item,
                  seal: undefined,
                  title: open?.title || item.title,
                  body: open?.body ?? item.body,
                  ink: open?.ink ?? item.ink,
                  updatedAt: Date.now(),
                }
              : item,
          ),
        });
      },
      cycleMode: () => {
        const current = modes.indexOf(get().mode);
        const next = modes[(current + 1) % modes.length] ?? "source";
        set({ mode: next, view: "notes" });
      },
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      setSidebar: (sidebarOpen) => set({ sidebarOpen }),
      setFocus: (focusMode) => {
        const wide =
          typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
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
          mode: "visual",
          focusMode: false,
          focusTick: get().focusTick + 1,
          query: "",
        });
      },
      updateBody: (id, body) => {
        const open = get().openNotes[id];
        if (open) {
          const next = { ...open, body };
          set({ openNotes: { ...get().openNotes, [id]: next } });
          scheduleSeal(id, next, (noteId, packed) => {
            set({
              notes: get().notes.map((note) =>
                note.id === noteId && note.seal
                  ? {
                      ...note,
                      body: "",
                      ink: [],
                      seal: { ...note.seal, ...packed },
                      updatedAt: Date.now(),
                    }
                  : note,
              ),
            });
          });
          return;
        }
        const note = get().notes.find((item) => item.id === id);
        if (note?.seal) return;
        set({
          notes: get().notes.map((item) =>
            item.id === id ? { ...item, body, updatedAt: Date.now() } : item,
          ),
        });
      },
      insertFigure: (slug, options) => {
        const line = formatFigureEmbed({ slug, ...options });
        const state = get();
        const note = state.notes.find((item) => item.id === state.activeId);
        if (!note) {
          const created = blank("Figura", `${line}\n`);
          set({
            notes: [created, ...state.notes],
            activeId: created.id,
            view: "notes",
            mode: "visual",
            paletteOpen: false,
          });
          return;
        }
        const current = state.openNotes[note.id]?.body ?? (note.seal ? "" : note.body);
        const body = current.includes(line) ? current : `${current.trim()}\n\n${line}\n`;
        get().updateBody(note.id, body);
        set({ view: "notes", mode: "visual", paletteOpen: false });
      },
      placeSticker: ({ slug, animated = true, tilt }) => {
        const list = get().stickers ?? [];
        const placedNotes = get().notes.filter((note) => note.canvas);
        const right = placedNotes.reduce(
          (max, note) => Math.max(max, (note.canvas?.x ?? 0) + (note.canvas?.w ?? 0)),
          48,
        );
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
          stickers: (get().stickers ?? []).map((sticker) =>
            sticker.id === id ? { ...sticker, x, y } : sticker,
          ),
        }),
      removeSticker: (id) =>
        set({ stickers: (get().stickers ?? []).filter((sticker) => sticker.id !== id) }),
      setIdeaOpen: (ideaOpen) => set({ ideaOpen }),
      saveIdea: (idea) => {
        const ideas = get().ideas ?? [];
        const slug = ideaSlug(
          idea.slug || idea.name || idea.title,
          ideas.map((item) => item.slug),
        );
        const saved: SavedIdea = { ...idea, name: idea.name || idea.title, slug };
        set({ ideas: [...ideas, saved] });
        get().insertFigure(slug);
        return slug;
      },
      renameIdea: (slug, title, nextSlug) => {
        const clean = ideaSlug(
          nextSlug.replace(/^ideia-/, ""),
          (get().ideas ?? []).filter((item) => item.slug !== slug).map((item) => item.slug),
        );
        const target = clean === slug ? slug : clean;
        const swap = (body: string) =>
          body.replace(new RegExp(`!\\[\\[figure:${slug}(?=[|\\]])`, "g"), `![[figure:${target}`);
        const openNotes = { ...get().openNotes };
        for (const [noteId, open] of Object.entries(openNotes)) {
          const body = swap(open.body);
          if (body === open.body) continue;
          openNotes[noteId] = { ...open, body };
          if (get().notes.find((item) => item.id === noteId)?.seal) {
            scheduleSeal(noteId, { ...open, body }, (sealedId, packed) => {
              set({
                notes: get().notes.map((item) =>
                  item.id === sealedId && item.seal
                    ? {
                        ...item,
                        body: "",
                        ink: [],
                        seal: { ...item.seal, ...packed },
                        updatedAt: Date.now(),
                      }
                    : item,
                ),
              });
            });
          }
        }
        set({
          ideas: (get().ideas ?? []).map((item) =>
            item.slug === slug
              ? { ...item, title: title.trim() || item.title, slug: target }
              : item,
          ),
          stickers: (get().stickers ?? []).map((sticker) =>
            sticker.slug === slug ? { ...sticker, slug: target } : sticker,
          ),
          openNotes,
          notes: get().notes.map((note) => ({
            ...note,
            body: note.seal ? "" : swap(note.body),
          })),
        });
      },
      deleteIdea: (slug) =>
        set({
          ideas: (get().ideas ?? []).filter((item) => item.slug !== slug),
          stickers: (get().stickers ?? []).filter((sticker) => sticker.slug !== slug),
        }),
      updateTitle: (id, title) => {
        const state = get();
        const open = state.openNotes[id];
        const note = state.notes.find((item) => item.id === id);
        if (open && note?.seal) {
          const next = { ...open, title };
          set({
            openNotes: { ...state.openNotes, [id]: next },
            notes: state.notes.map((item) =>
              item.id === id && !item.seal?.hideTitle
                ? { ...item, title, updatedAt: Date.now() }
                : item,
            ),
          });
          scheduleSeal(id, next, (noteId, packed) => {
            set({
              notes: get().notes.map((item) =>
                item.id === noteId && item.seal
                  ? {
                      ...item,
                      body: "",
                      ink: [],
                      seal: { ...item.seal, ...packed },
                      updatedAt: Date.now(),
                    }
                  : item,
              ),
            });
          });
          return;
        }
        if (note?.seal) return;
        set({
          notes: state.notes.map((item) => (item.id === id ? { ...item, title } : item)),
        });
      },
      setLook: (id, look) =>
        set({
          notes: get().notes.map((item) =>
            item.id === id ? { ...item, ...look, updatedAt: Date.now() } : item,
          ),
        }),
      setInk: (id, ink) => {
        const open = get().openNotes[id];
        if (open) {
          const next = { ...open, ink };
          set({ openNotes: { ...get().openNotes, [id]: next } });
          scheduleSeal(id, next, (noteId, packed) => {
            set({
              notes: get().notes.map((item) =>
                item.id === noteId && item.seal
                  ? {
                      ...item,
                      body: "",
                      ink: [],
                      seal: { ...item.seal, ...packed },
                      updatedAt: Date.now(),
                    }
                  : item,
              ),
            });
          });
          return;
        }
        const note = get().notes.find((item) => item.id === id);
        if (note?.seal) return;
        set({
          notes: get().notes.map((item) =>
            item.id === id ? { ...item, ink, updatedAt: Date.now() } : item,
          ),
        });
      },
      commitRename: (id, from, to) => {
        const next = to.trim();
        const prev = from.trim();
        if (!next || next.toLowerCase() === prev.toLowerCase()) {
          get().updateTitle(id, next || prev || "Sem título");
          return;
        }
        const state = get();
        const openNotes = { ...state.openNotes };
        for (const [noteId, open] of Object.entries(openNotes)) {
          openNotes[noteId] = {
            title: noteId === id ? next : open.title,
            body: rewriteWikilinks(open.body, prev, next),
            ink: open.ink ?? [],
          };
        }
        set({
          openNotes,
          notes: state.notes.map((note) => {
            const sealed = Boolean(note.seal);
            const body = sealed ? "" : rewriteWikilinks(note.body, prev, next);
            const title = note.id === id ? (note.seal?.hideTitle ? note.title : next) : note.title;
            const changed = note.id === id || body !== note.body;
            return { ...note, title, body, updatedAt: changed ? Date.now() : note.updatedAt };
          }),
        });
        for (const [noteId, open] of Object.entries(openNotes)) {
          if (!get().notes.find((item) => item.id === noteId)?.seal) continue;
          scheduleSeal(noteId, open, (sealedId, packed) => {
            set({
              notes: get().notes.map((item) =>
                item.id === sealedId && item.seal
                  ? {
                      ...item,
                      body: "",
                      ink: [],
                      seal: { ...item.seal, ...packed },
                      updatedAt: Date.now(),
                    }
                  : item,
              ),
            });
          });
        }
      },
      deleteNote: (id) => {
        forgetKey(id);
        const notes = get().notes.filter((note) => note.id !== id);
        const activeId = get().activeId === id ? (notes[0]?.id ?? "") : get().activeId;
        const { [id]: _drop, ...openNotes } = get().openNotes;
        set({ notes, activeId, confirm: null, openNotes });
      },
      placeOnCanvas: (id) => {
        const notes = get().notes.map((note) =>
          note.id === id && !note.canvas
            ? { ...note, canvas: spot(get().notes), updatedAt: Date.now() }
            : note,
        );
        set({ notes, view: "canvas" });
      },
      moveCanvas: (id, x, y) =>
        set({
          notes: get().notes.map((note) =>
            note.id === id && note.canvas ? { ...note, canvas: { ...note.canvas, x, y } } : note,
          ),
        }),
      updateCell: (id, code) =>
        set({ cells: get().cells.map((cell) => (cell.id === id ? { ...cell, code } : cell)) }),
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
          mode: get().sourceChosen ? "source" : "visual",
          focusTick: get().focusTick + 1,
        });
      },
      ask: (text) => {
        if (get().atlasPending) return;
        const state = get();
        const readable = presentNotes(state.notes, state.openNotes);
        const active = readable.find((note) => note.id === state.activeId);
        const plan = planTurn(text, readable, active);
        const user: ChatMessage = { id: messageId(), role: "user", content: text.trim() };
        if (plan.kind === "fabric") {
          const assistantId = messageId();
          const assistant: ChatMessage = {
            id: assistantId,
            role: "assistant",
            content: `Lendo a fonte com \`${plan.patternId}\`. Nada foi escrito.`,
          };
          set({
            messages: [...state.messages, user, assistant].slice(-40),
            view: "atlas",
            fabricJob: {
              assistantId,
              patternId: plan.patternId,
              source: plan.source,
              started: false,
            },
          });
          return;
        }
        let assistant: ChatMessage;
        if (plan.kind === "reply") {
          assistant = { id: messageId(), role: "assistant", content: plan.content };
        } else if (plan.kind === "search") {
          const local = runReadOnly("vault.search", { query: plan.query }, readable, state.cells);
          const fragments = selectFragments(plan.query, state.notes).map((fragment) => ({
            noteId: fragment.noteId,
            title: fragment.title.slice(0, 160),
            text: fragment.text.slice(0, 700),
            score: fragment.score,
          }));
          const trace = {
            name: "vault.search",
            readOnly: true as const,
            args: { query: plan.query },
            status: "done" as const,
          };
          if (!fragments.length) {
            assistant = {
              id: messageId(),
              role: "assistant",
              content: local.content,
              citations: local.citations,
              trace: { ...trace, result: local.result },
            };
          } else {
            const flight = ++atlasFlight;
            const query = plan.query;
            set({
              messages: [...state.messages, user].slice(-40),
              view: "atlas",
              fabricJob: null,
              atlasPending: true,
            });
            const finish = (outcome: AtlasOutcome | null) => {
              if (flight !== atlasFlight) return;
              const grounded = resolveAtlasTurn(outcome, {
                content: local.content,
                citations: local.citations,
                result: local.result,
              });
              const reply: ChatMessage = {
                id: messageId(),
                role: "assistant",
                content: grounded.content,
                citations: grounded.citations,
                trace: { ...trace, args: { query }, result: grounded.result },
              };
              set({
                messages: [...get().messages, reply].slice(-40),
                atlasPending: false,
              });
            };
            void consultAtlas(
              { question: query.slice(0, 500), fragments },
              {
                ready: async () => (await atlasReady()).enabled,
                ask: (payload) => askAtlas({ data: payload }),
              },
            ).then(finish, () => finish(null));
            return;
          }
        } else if (plan.readOnly) {
          const outcome = runReadOnly(plan.name, plan.args, readable, state.cells);
          assistant = {
            id: messageId(),
            role: "assistant",
            content: outcome.content,
            citations: outcome.citations,
            trace: {
              name: plan.name,
              readOnly: true,
              args: plan.args,
              status: "done",
              result: outcome.result,
            },
          };
        } else {
          assistant = {
            id: messageId(),
            role: "assistant",
            content: plan.preview,
            trace: { name: plan.name, readOnly: false, args: plan.args, status: "pending" },
          };
        }
        set({
          messages: [...state.messages, user, assistant].slice(-40),
          view: "atlas",
          fabricJob: null,
        });
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
      preparePattern: (id) =>
        set({ pendingPrompt: `${id}\n`, view: "atlas", paletteOpen: false, focusMode: false }),
      approve: (id) => {
        const state = get();
        const message = state.messages.find((item) => item.id === id);
        const trace = message?.trace;
        if (!trace || trace.status !== "pending") return;
        let notes = state.notes;
        let cells = state.cells;
        let openNotes = state.openNotes;
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
          const open = target ? openNotes[target.id] : undefined;
          if (!target) result = "Nota não encontrada. Nada foi escrito.";
          else if (target.seal && !open) result = "Nota trancada. Nada foi escrito.";
          else if (target.seal && open) {
            const body = `${open.body.trim()}\n\n${trace.args.text ?? ""}\n`;
            openNotes = { ...openNotes, [target.id]: { ...open, body } };
            activeId = target.id;
            result = `Texto acrescentado em ${open.title}.`;
            scheduleSeal(target.id, { ...open, body }, (noteId, packed) => {
              set({
                notes: get().notes.map((note) =>
                  note.id === noteId && note.seal
                    ? {
                        ...note,
                        body: "",
                        ink: [],
                        seal: { ...note.seal, ...packed },
                        updatedAt: Date.now(),
                      }
                    : note,
                ),
              });
            });
          } else {
            notes = notes.map((note) =>
              note.id === target.id
                ? {
                    ...note,
                    body: `${note.body.trim()}\n\n${trace.args.text ?? ""}\n`,
                    updatedAt: Date.now(),
                  }
                : note,
            );
            activeId = target.id;
            result = `Texto acrescentado em ${target.title}.`;
          }
        } else if (trace.name === "canvas.place") {
          const target = findNoteLoose(notes, trace.args.title ?? "");
          if (!target) result = "Nota não encontrada.";
          else if (target.canvas) result = `${target.title} já estava no canvas.`;
          else {
            notes = notes.map((note) =>
              note.id === target.id
                ? { ...note, canvas: spot(notes), updatedAt: Date.now() }
                : note,
            );
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
          if (extraCells.length)
            cells = [...cells, ...extraCells.map((code) => ({ id: crypto.randomUUID(), code }))];
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
          openNotes,
          activeId,
          view,
          messages: state.messages.map((item) =>
            item.id === id && item.trace
              ? { ...item, trace: { ...item.trace, status: "done", result } }
              : item,
          ),
        });
      },
      refuse: (id) =>
        set({
          messages: get().messages.map((item) =>
            item.id === id && item.trace
              ? {
                  ...item,
                  trace: {
                    ...item.trace,
                    status: "refused",
                    result: "Recusado. Nada foi escrito.",
                  },
                }
              : item,
          ),
        }),
      resetVault: () => {
        forgetAllKeys();
        atlasFlight += 1;
        const notes = seedNotes();
        set({
          notes,
          stickers: [],
          openNotes: {},
          cells: seedCells(),
          messages: [],
          activeId: "n-today",
          sourceChosen: false,
          placeSuggest: true,
          placeAlerts: true,
          mode: "visual",
          view: "notes",
          confirm: null,
          query: "",
          fabricJob: null,
          atlasPending: false,
          pendingPrompt: "",
        });
      },
    }),
    {
      name: "locus-vault-v1",
      storage: createJSONStorage(storage),
      skipHydration: true,
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<VaultState>;
        const legacy =
          !persisted || typeof persisted !== "object" || !("sourceChosen" in persisted);
        const sourceChosen = legacy ? false : Boolean(saved.sourceChosen);
        const mode: WriteMode =
          legacy || saved.mode === "blocks" || (!sourceChosen && saved.mode === "source")
            ? "visual"
            : (saved.mode ?? "visual");
        return {
          ...current,
          ...saved,
          ideas: saved.ideas ?? [],
          stickers: saved.stickers ?? [],
          openNotes: {},
          sourceChosen,
          placeSuggest: saved.placeSuggest !== false,
          placeAlerts: saved.placeAlerts !== false,
          mode,
          atlasPending: false,
        };
      },
      partialize: (state) => ({
        notes: state.notes,
        stickers: state.stickers,
        ideas: state.ideas,
        sourceChosen: state.sourceChosen,
        placeSuggest: state.placeSuggest,
        placeAlerts: state.placeAlerts,
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
