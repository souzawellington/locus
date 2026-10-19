import { Command } from "cmdk";
import { downloadText, slugify } from "@/lib/vault/format";
import { FIGURES } from "@/figures/geometry/machines";
import { PATTERNS } from "@/lib/vault/patterns";
import { useVault } from "@/lib/vault/store";
import type { WorkspaceView, WriteMode } from "@/lib/vault/types";

const views: { id: WorkspaceView; label: string }[] = [
  { id: "notes", label: "Ir para Notas" },
  { id: "canvas", label: "Ir para Canvas" },
  { id: "notebook", label: "Ir para Caderno" },
  { id: "graph", label: "Ir para Grafo" },
  { id: "atlas", label: "Ir para Atlas" },
];

const modes: { id: WriteMode; label: string }[] = [
  { id: "source", label: "Escrita em markdown" },
  { id: "blocks", label: "Escrita em blocos" },
  { id: "read", label: "Leitura renderizada" },
];

export function CommandPalette({ shortcut }: { shortcut: string }) {
  const open = useVault((state) => state.paletteOpen);
  const setPalette = useVault((state) => state.setPalette);
  const notes = useVault((state) => state.notes);
  const activeId = useVault((state) => state.activeId);
  const createNote = useVault((state) => state.createNote);
  const select = useVault((state) => state.select);
  const setView = useVault((state) => state.setView);
  const setMode = useVault((state) => state.setMode);
  const toggleTheme = useVault((state) => state.toggleTheme);
  const setFocus = useVault((state) => state.setFocus);
  const focusMode = useVault((state) => state.focusMode);
  const setConfirm = useVault((state) => state.setConfirm);
  const preparePattern = useVault((state) => state.preparePattern);
  const insertFigure = useVault((state) => state.insertFigure);

  function close() {
    setPalette(false);
  }

  const active = notes.find((note) => note.id === activeId);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setPalette}
      label="Comandos"
      vimBindings={false}
      overlayClassName="fixed inset-0 z-40 bg-ink/40"
      contentClassName="fixed inset-x-4 top-24 z-50 mx-auto max-w-xl overflow-hidden rounded-lg border border-line bg-paper-2 text-ink shadow-lg"
    >
      <Command.Input placeholder="Buscar comandos e notas" className="w-full border-b border-line bg-transparent px-4 py-3 text-base outline-none placeholder:text-muted" />
      <Command.List className="max-h-80 overflow-auto p-2">
        <Command.Empty className="px-3 py-6 text-sm text-muted">Nada encontrado.</Command.Empty>
        <Command.Group heading="Ações">
          <Command.Item className="rounded-md px-3 py-3 text-sm" onSelect={() => { createNote(); close(); }}>
            Nova nota
          </Command.Item>
          <Command.Item className="rounded-md px-3 py-3 text-sm" onSelect={() => { toggleTheme(); close(); }}>
            Alternar tema
          </Command.Item>
          <Command.Item className="rounded-md px-3 py-3 text-sm" onSelect={() => { setFocus(!focusMode); close(); }}>
            {focusMode ? "Sair do foco" : "Modo foco"}
          </Command.Item>
          {modes.map((mode) => (
            <Command.Item key={mode.id} className="rounded-md px-3 py-3 text-sm" onSelect={() => { setMode(mode.id); setView("notes"); close(); }}>
              {mode.label}
            </Command.Item>
          ))}
          <Command.Item
            className="rounded-md px-3 py-3 text-sm"
            onSelect={() => {
              if (!active) return;
              downloadText(`${slugify(active.title)}.md`, `# ${active.title}\n\n${active.body.trim()}\n`);
              close();
            }}
          >
            Exportar nota aberta
          </Command.Item>
          <Command.Item
            className="rounded-md px-3 py-3 text-sm"
            onSelect={() => {
              const text = notes.map((note) => `# ${note.title}\n\n${note.body.trim()}\n`).join("\n---\n\n");
              downloadText("locus-cofre.md", text);
              close();
            }}
          >
            Exportar o cofre
          </Command.Item>
          <Command.Item className="rounded-md px-3 py-3 text-sm" onSelect={() => { setConfirm({ kind: "reset" }); close(); }}>
            Restaurar notas de exemplo
          </Command.Item>
        </Command.Group>
        <Command.Group heading="Figuras">
          {FIGURES.map((figure) => (
            <Command.Item
              key={figure.slug}
              value={`figura ${figure.slug} ${figure.title} ${figure.blurb}`}
              className="rounded-md px-3 py-3 text-sm"
              onSelect={() => insertFigure(figure.slug)}
            >
              <span className="font-mono text-xs text-copper">{figure.fig}</span>
              <span className="mt-1 block text-ink">{figure.title}</span>
              <span className="block text-xs text-muted">{figure.blurb}</span>
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
            <Command.Item key={view.id} className="rounded-md px-3 py-3 text-sm" onSelect={() => { setView(view.id); close(); }}>
              {view.label}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Notas">
          {notes.map((note) => (
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
      <p className="border-t border-line px-4 py-2 text-xs text-muted">{shortcut}+K fecha · esc fecha</p>
    </Command.Dialog>
  );
}
