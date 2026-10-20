import { Command } from "cmdk";
import { useState } from "react";
import { exportMarkdown } from "@/lib/vault/appearance";
import { downloadText } from "@/lib/vault/format";
import { FIGURES } from "@/figures/geometry/machines";
import { PATTERNS } from "@/lib/vault/patterns";
import { presentNotes } from "@/lib/vault/retrieve";
import { useVault } from "@/lib/vault/store";
import type { WorkspaceView } from "@/lib/vault/types";
import { ApproveLine } from "./approve";

const views: { id: WorkspaceView; label: string }[] = [
  { id: "notes", label: "Ir para Notas" },
  { id: "canvas", label: "Ir para Canvas" },
  { id: "notebook", label: "Ir para Caderno" },
  { id: "graph", label: "Ir para Grafo" },
  { id: "atlas", label: "Ir para Atlas" },
  { id: "map", label: "Ir para Mapa" },
];

export function CommandPalette({ shortcut }: { shortcut: string }) {
  const open = useVault((state) => state.paletteOpen);
  const setPalette = useVault((state) => state.setPalette);
  const notes = useVault((state) => state.notes);
  const openNotes = useVault((state) => state.openNotes);
  const activeId = useVault((state) => state.activeId);
  const createNote = useVault((state) => state.createNote);
  const select = useVault((state) => state.select);
  const setView = useVault((state) => state.setView);
  const setMode = useVault((state) => state.setMode);
  const setSourceChosen = useVault((state) => state.setSourceChosen);
  const toggleTheme = useVault((state) => state.toggleTheme);
  const setFocus = useVault((state) => state.setFocus);
  const focusMode = useVault((state) => state.focusMode);
  const setConfirm = useVault((state) => state.setConfirm);
  const preparePattern = useVault((state) => state.preparePattern);
  const insertFigure = useVault((state) => state.insertFigure);
  const setIdeaOpen = useVault((state) => state.setIdeaOpen);
  const ideas = useVault((state) => state.ideas) ?? [];
  const [pendingExport, setPendingExport] = useState<{ filename: string; text: string } | null>(
    null,
  );

  function close() {
    setPalette(false);
  }

  const readable = presentNotes(notes, openNotes);
  const active = readable.find((note) => note.id === activeId);

  return (
    <>
      <Command.Dialog
        open={open}
        onOpenChange={setPalette}
        label="Comandos"
        vimBindings={false}
        overlayClassName="fixed inset-0 z-40 bg-ink/40"
        contentClassName="fixed inset-x-4 top-24 z-50 mx-auto max-w-xl overflow-hidden rounded-lg border border-line bg-paper-2 text-ink shadow-lg"
      >
        <Command.Input
          placeholder="Buscar comandos e notas"
          className="w-full border-b border-line bg-transparent px-4 py-3 text-base outline-none placeholder:text-muted"
        />
        <Command.List className="max-h-80 overflow-auto p-2">
          <Command.Empty className="px-3 py-6 text-sm text-muted">Nada encontrado.</Command.Empty>
          <Command.Group heading="Ações">
            <Command.Item
              className="rounded-md px-3 py-3 text-sm"
              onSelect={() => {
                createNote();
                close();
              }}
            >
              Nova nota
            </Command.Item>
            <Command.Item
              className="rounded-md px-3 py-3 text-sm"
              onSelect={() => {
                toggleTheme();
                close();
              }}
            >
              Alternar tema
            </Command.Item>
            <Command.Item
              className="rounded-md px-3 py-3 text-sm"
              onSelect={() => {
                setFocus(!focusMode);
                close();
              }}
            >
              {focusMode ? "Sair do foco" : "Modo foco"}
            </Command.Item>
            <Command.Item
              className="rounded-md px-3 py-3 text-sm"
              onSelect={() => {
                setSourceChosen(false);
                setMode("visual");
                setView("notes");
                close();
              }}
            >
              Editor visual
            </Command.Item>
            <Command.Item
              className="rounded-md px-3 py-3 text-sm"
              onSelect={() => {
                setMode("read");
                setView("notes");
                close();
              }}
            >
              Leitura
            </Command.Item>
            <Command.Item
              className="rounded-md px-3 py-3 text-sm"
              onSelect={() => {
                setSourceChosen(true);
                setView("notes");
                close();
              }}
            >
              Ver código
            </Command.Item>
            <Command.Item
              className="rounded-md px-3 py-3 text-sm"
              onSelect={() => {
                if (!active || (active.seal && !openNotes[active.id])) return;
                const file = exportMarkdown(active);
                setPendingExport(file);
                close();
              }}
            >
              Exportar nota aberta
            </Command.Item>
            <Command.Item
              className="rounded-md px-3 py-3 text-sm"
              onSelect={() => {
                const text = readable
                  .filter((note) => !(note.seal && !openNotes[note.id]))
                  .map((note) => exportMarkdown(note).text)
                  .join("\n---\n\n");
                setPendingExport({ filename: "locus-notas.md", text });
                close();
              }}
            >
              Exportar todas as notas
            </Command.Item>
            <Command.Item
              className="rounded-md px-3 py-3 text-sm"
              onSelect={() => {
                setConfirm({ kind: "reset" });
                close();
              }}
            >
              Restaurar notas de exemplo
            </Command.Item>
          </Command.Group>
          <Command.Group heading="Figuras">
            <Command.Item
              className="rounded-md px-3 py-3 text-sm"
              value="proponha uma ideia figura nova"
              onSelect={() => {
                close();
                setIdeaOpen(true);
              }}
            >
              Proponha uma ideia
            </Command.Item>
            {FIGURES.map((figure) => (
              <Command.Item
                key={figure.slug}
                value={`figura ${figure.slug} ${figure.title} ${figure.blurb}`}
                className="rounded-md px-3 py-3 text-sm"
                onSelect={() => insertFigure(figure.slug)}
              >
                <span className="block text-ink">{figure.title}</span>
                <span className="block text-xs text-muted">{figure.blurb}</span>
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Figurinhas">
            {FIGURES.map((figure, index) => (
              <Command.Item
                key={`sticker-${figure.slug}`}
                value={`figurinha ${figure.title} ${figure.blurb}`}
                className="rounded-md px-3 py-3 text-sm"
                onSelect={() =>
                  insertFigure(figure.slug, {
                    size: "sticker",
                    motion: "animated",
                    tilt: (index % 5) - 2,
                  })
                }
              >
                <span className="block text-ink">{figure.title}</span>
                <span className="block text-xs text-muted">Animada, na nota aberta</span>
              </Command.Item>
            ))}
            {ideas.map((idea) => (
              <Command.Item
                key={`idea-${idea.slug}`}
                value={`minha figura ${idea.slug} ${idea.title}`}
                className="rounded-md px-3 py-3 text-sm"
                onSelect={() => insertFigure(idea.slug)}
              >
                <span className="block text-ink">{idea.title}</span>
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Biblioteca dos Profissionais">
            {PATTERNS.map((pattern) => (
              <Command.Item
                key={pattern.id}
                value={`biblioteca ${pattern.id} ${pattern.label} ${pattern.blurb}`}
                className="rounded-md px-3 py-3 text-sm"
                onSelect={() => preparePattern(pattern.id)}
              >
                <span className="font-mono text-xs text-copper">{pattern.id}</span>
                <span className="mt-1 block text-ink">{pattern.label}</span>
                <span className="block text-xs text-muted">{pattern.blurb}</span>
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Vistas">
            {views.map((view) => (
              <Command.Item
                key={view.id}
                className="rounded-md px-3 py-3 text-sm"
                onSelect={() => {
                  setView(view.id);
                  close();
                }}
              >
                {view.label}
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Notas">
            {readable.map((note) => (
              <Command.Item
                key={note.id}
                value={`${note.title} ${note.id}`}
                className="rounded-md px-3 py-3 text-sm"
                onSelect={() => {
                  select(note.id);
                  close();
                }}
              >
                {note.title || "Sem título"}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
        <p className="border-t border-line px-4 py-2 text-xs text-muted">
          {shortcut}+K fecha · esc fecha
        </p>
      </Command.Dialog>
      {pendingExport ? (
        <ApproveLine
          sentence="Exportar este arquivo?"
          onYes={() => {
            downloadText(pendingExport.filename, pendingExport.text, "text/markdown");
            setPendingExport(null);
          }}
          onNo={() => setPendingExport(null)}
        />
      ) : null}
    </>
  );
}
