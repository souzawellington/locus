import { FileText, Frame, Library, Map as MapIcon, Moon, PanelLeft, Settings, Sigma, Sun, Waypoints, X } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { idleExpired, lastActiveAt, markActive } from "@/lib/vault/seal";
import { useVault } from "@/lib/vault/store";
import type { WorkspaceView } from "@/lib/vault/types";
import { cn } from "@/lib/utils";
import { AtlasView } from "./atlas-view";
import { CanvasBoard } from "./canvas-board";
import { CommandPalette } from "./command-palette";
import { DrawFigure } from "./draw-figure";
import { ProposeIdea } from "./propose-idea";
import { StickerDrawer } from "./sticker-drawer";
import { Editor } from "./editor";
import { GraphView } from "./graph-view";
import { SettingsSheet } from "./settings-sheet";
import { WorldMap } from "./world-map";
import { Sidebar } from "./sidebar";

const NotebookView = lazy(() => import("./notebook-view").then((mod) => ({ default: mod.NotebookView })));

const views: { id: WorkspaceView; label: string; icon: typeof FileText }[] = [
  { id: "notes", label: "Notas", icon: FileText },
  { id: "canvas", label: "Canvas", icon: Frame },
  { id: "notebook", label: "Caderno", icon: Sigma },
  { id: "graph", label: "Grafo", icon: Waypoints },
  { id: "atlas", label: "Atlas", icon: Library },
  { id: "map", label: "Mapa", icon: MapIcon },
];

function shortcutLabel() {
  if (typeof navigator === "undefined") return "Ctrl";
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";
}

export function LocusApp() {
  const view = useVault((state) => state.view);
  const theme = useVault((state) => state.theme);
  const sidebarOpen = useVault((state) => state.sidebarOpen);
  const focusMode = useVault((state) => state.focusMode);
  const confirm = useVault((state) => state.confirm);
  const notes = useVault((state) => state.notes);
  const setView = useVault((state) => state.setView);
  const setSidebar = useVault((state) => state.setSidebar);
  const toggleTheme = useVault((state) => state.toggleTheme);
  const setFocus = useVault((state) => state.setFocus);
  const setPalette = useVault((state) => state.setPalette);
  const setConfirm = useVault((state) => state.setConfirm);
  const deleteNote = useVault((state) => state.deleteNote);
  const resetVault = useVault((state) => state.resetVault);
  const shortcut = shortcutLabel();
  const [hold, setHold] = useState(true);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openCount = useVault((state) => Object.keys(state.openNotes).length);
  const unlockAllNow = useVault((state) => state.unlockAllNow);
  const ideaOpen = useVault((state) => state.ideaOpen);
  const setIdeaOpen = useVault((state) => state.setIdeaOpen);
  const figureOpen = useVault((state) => state.figureOpen);
  const setFigureOpen = useVault((state) => state.setFigureOpen);

  useEffect(() => {
    let live = true;
    const settle = () => {
      if (!live) return;
      live = false;
      if (window.matchMedia("(max-width: 767px)").matches) useVault.setState({ sidebarOpen: false });
      setHold(false);
    };
    const timer = window.setTimeout(settle, 400);
    try {
      void Promise.resolve(useVault.persist.rehydrate()).then(settle, settle);
    } catch {
      settle();
    }
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const bump = () => markActive();
    window.addEventListener("pointerdown", bump, { passive: true });
    window.addEventListener("keydown", bump);
    const timer = window.setInterval(() => {
      const state = useVault.getState();
      if (Object.keys(state.openNotes).length > 0 && idleExpired(lastActiveAt(), Date.now())) state.unlockAllNow();
    }, 5000);
    return () => {
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const meta = event.metaKey || event.ctrlKey;
      const state = useVault.getState();
      const key = event.key.toLowerCase();
      if (state.paletteOpen) {
        if (meta && key === "k") {
          event.preventDefault();
          state.setPalette(false);
        }
        return;
      }
      if (meta && key === "k") {
        event.preventDefault();
        state.setPalette(true);
        return;
      }
      if (meta && key === "n") {
        event.preventDefault();
        state.createNote();
        return;
      }
      if (meta && key === "e") {
        event.preventDefault();
        state.cycleMode();
        return;
      }
      if (meta && event.key === "\\") {
        event.preventDefault();
        state.setSidebar(!state.sidebarOpen);
        return;
      }
      if (meta && ["1", "2", "3", "4", "5", "6"].includes(event.key)) {
        event.preventDefault();
        const next = views[Number(event.key) - 1];
        if (next) state.setView(next.id);
        return;
      }
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "Escape") {
        if (state.focusMode) state.setFocus(false);
        else if (state.confirm) state.setConfirm(null);
        else if (state.sidebarOpen && window.matchMedia("(max-width: 767px)").matches) state.setSidebar(false);
        return;
      }
      if (!typing && event.key === "/") {
        event.preventDefault();
        state.setSidebar(true);
        window.setTimeout(() => document.getElementById("locus-search")?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const confirmNote = confirm?.kind === "delete" ? notes.find((note) => note.id === confirm.id) : undefined;
  const showSidebar = sidebarOpen && !focusMode;
  const mountSidebar = !focusMode && (showSidebar || hold);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper text-ink">
      <header className={cn("flex items-center gap-2 overflow-x-auto border-b border-line px-2 py-1 md:px-3", focusMode ? "" : "md:py-2")}>
        {focusMode ? null : (
          <button
            type="button"
            aria-label={sidebarOpen ? "Fechar lista" : "Abrir lista"}
            onClick={() => setSidebar(!sidebarOpen)}
            className="grid size-11 place-items-center rounded-md"
          >
            <PanelLeft className="size-5" />
          </button>
        )}
        <p className="font-serif text-xl text-ink">Locus</p>
        {focusMode ? (
          <span className="text-sm text-muted">Foco</span>
        ) : (
          <span className="hidden items-center gap-2 text-xs text-muted sm:inline-flex">
            <span className="size-1.5 rounded-full bg-copper" aria-hidden />
            Salvo
          </span>
        )}
        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Vistas">
          {focusMode
            ? null
            : views.map((item) => {
                const Icon = item.icon;
                const active = view === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => setView(item.id)}
                    className={cn(
                      "inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm",
                      active ? "bg-copper-soft text-ink" : "text-muted",
                    )}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </button>
                );
              })}
        </nav>
        {openCount > 0 ? (
          <button type="button" onClick={() => unlockAllNow()} className="h-10 rounded-md px-3 text-sm text-ink">
            Trancar agora
          </button>
        ) : null}
        <button type="button" aria-label="Ajustes" onClick={() => setSettingsOpen(true)} className="grid size-11 place-items-center rounded-md">
          <Settings className="size-5" />
        </button>
        <button type="button" aria-label="Alternar tema" onClick={toggleTheme} className="grid size-11 place-items-center rounded-md">
          {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>
        <button type="button" onClick={() => setFocus(!focusMode)} className="h-10 rounded-md px-3 text-sm text-muted">
          {focusMode ? "Sair do foco" : "Foco"}
        </button>
        <button type="button" aria-expanded={stickersOpen} onClick={() => setStickersOpen(true)} className="h-10 rounded-md px-3 text-sm text-muted">
          Figurinhas
        </button>
        <button type="button" aria-label="Comandos" onClick={() => setPalette(true)} className="hidden h-10 rounded-md px-3 text-sm text-muted sm:inline">
          {shortcut}+K
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {mountSidebar ? (
          <>
            {showSidebar && !hold ? (
              <button type="button" aria-label="Fechar lista" className="absolute inset-0 z-20 bg-ink/30 md:hidden" onClick={() => setSidebar(false)} />
            ) : null}
            <Sidebar shortcut={shortcut} hold={hold} />
          </>
        ) : null}
        <main className="min-w-0 flex-1">
          {view === "notes" ? <Editor /> : null}
          {view === "canvas" ? <CanvasBoard /> : null}
          {view === "notebook" ? (
            <Suspense fallback={<p className="px-8 py-10 text-sm text-muted">Abrindo o caderno…</p>}>
              <NotebookView />
            </Suspense>
          ) : null}
          {view === "graph" ? <GraphView /> : null}
          {view === "atlas" ? <AtlasView /> : null}
          {view === "map" ? <WorldMap /> : null}
        </main>
      </div>

      {focusMode ? null : (
        <nav className="safe-bottom flex border-t border-line bg-paper md:hidden" aria-label="Vistas">
          {views.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={cn("flex h-14 flex-1 flex-col items-center justify-center gap-1 text-xs", active ? "text-copper" : "text-muted")}
              >
                <Icon className="size-5" />
                {item.label}
              </button>
            );
          })}
        </nav>
      )}

      <CommandPalette shortcut={shortcut} />
      <StickerDrawer open={stickersOpen} onClose={() => setStickersOpen(false)} />
      <ProposeIdea open={ideaOpen} onClose={() => setIdeaOpen(false)} />
      <DrawFigure open={figureOpen} onClose={() => setFigureOpen(false)} />

      {confirm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <button type="button" aria-label="Fechar diálogo" className="absolute inset-0 bg-ink/40" onClick={() => setConfirm(null)} />
          <div className="relative m-4 w-full max-w-md rounded-lg border border-line bg-paper-2 p-5">
            <button type="button" aria-label="Fechar" className="absolute top-2 right-2 grid size-11 place-items-center" onClick={() => setConfirm(null)}>
              <X className="size-4" />
            </button>
            <h2 id="confirm-title" className="pr-10 font-serif text-2xl text-ink">
              {confirm.kind === "delete" ? `Excluir “${confirmNote?.title || "esta nota"}”?` : "Restaurar os exemplos?"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {confirm.kind === "delete"
                ? "A nota sai deste dispositivo. Não há cópia na nuvem."
                : "Isso substitui notas, caderno e o histórico do Atlas pelos exemplos iniciais."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="h-11 rounded-md border border-line px-4 text-sm" onClick={() => setConfirm(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="h-11 rounded-md bg-danger px-4 text-sm text-paper-2"
                onClick={() => {
                  if (confirm.kind === "delete") deleteNote(confirm.id);
                  else resetVault();
                }}
              >
                {confirm.kind === "delete" ? "Excluir" : "Restaurar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
