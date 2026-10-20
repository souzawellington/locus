import { Lock, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { noteColor } from "@/lib/vault/appearance";
import { relativeTime } from "@/lib/vault/format";
import { fold, presentNotes, searchNotes, snippet } from "@/lib/vault/retrieve";
import { useVault } from "@/lib/vault/store";
import { cn } from "@/lib/utils";

function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;
  const match = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").exec(text);
  if (!match || match.index === undefined) {
    if (fold(text).includes(fold(needle))) return <span className="text-copper">{text}</span>;
    return <>{text}</>;
  }
  const at = match.index;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-copper-soft text-ink">{text.slice(at, at + match[0].length)}</mark>
      {text.slice(at + match[0].length)}
    </>
  );
}

export function Sidebar({ shortcut, hold = false }: { shortcut: string; hold?: boolean }) {
  const notes = useVault((state) => state.notes);
  const openNotes = useVault((state) => state.openNotes);
  const activeId = useVault((state) => state.activeId);
  const query = useVault((state) => state.query);
  const setQuery = useVault((state) => state.setQuery);
  const select = useVault((state) => state.select);
  const createNote = useVault((state) => state.createNote);
  const setConfirm = useVault((state) => state.setConfirm);
  const setSidebar = useVault((state) => state.setSidebar);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const visible = searchNotes(presentNotes(notes, openNotes), query);

  function move(direction: 1 | -1) {
    if (!visible.length) return;
    const current = visible.findIndex((note) => note.id === activeId);
    const nextIndex =
      direction > 0 ? Math.min(visible.length - 1, current < 0 ? 0 : current + 1) : Math.max(0, current < 0 ? 0 : current - 1);
    const next = visible[nextIndex];
    if (next) select(next.id);
  }

  return (
    <aside
      className={cn(
        "z-30 h-full w-72 shrink-0 flex-col border-r border-line bg-paper-2 max-md:absolute max-md:inset-y-0 max-md:left-0",
        hold ? "hidden md:flex" : "flex",
      )}
    >
      <div className="flex flex-col gap-3 border-b border-line p-3">
        <label htmlFor="locus-search" className="sr-only">
          Buscar notas
        </label>
        <input
          id="locus-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              move(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              move(-1);
            } else if (event.key === "Enter" && visible[0]) {
              event.preventDefault();
              const current = visible.find((note) => note.id === activeId) ?? visible[0];
              select(current.id);
              setSidebar(false);
              document.getElementById("locus-body")?.focus();
            }
          }}
          placeholder="Busca instantânea"
          className="h-11 w-full rounded-md border border-line bg-paper px-3 text-sm text-ink outline-none placeholder:text-muted"
        />
        <button
          type="button"
          onClick={() => createNote()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-copper px-3 text-sm font-medium text-paper-2"
        >
          <Plus className="size-4" />
          Nova nota
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2" role="listbox" aria-label="Notas" aria-activedescendant={activeId ? `note-${activeId}` : undefined}>
        {visible.length === 0 ? (
          <p className="px-2 py-6 text-sm text-muted">{query ? "Nenhuma nota com esse termo." : "Nenhuma nota ainda."}</p>
        ) : (
          visible.map((note) => {
            const active = note.id === activeId;
            return (
              <div key={note.id} id={`note-${note.id}`} role="option" aria-selected={active} className="group relative">
                <button
                  type="button"
                  onClick={() => {
                    select(note.id);
                    if (window.matchMedia("(max-width: 767px)").matches) setSidebar(false);
                  }}
                  className={cn(
                    "flex w-full flex-col gap-1 rounded-md px-3 py-3 text-left",
                    active ? "bg-copper-soft" : "hover:bg-paper",
                  )}
                >
                  <span className="flex items-center gap-2 pr-8 font-medium text-ink">
                    <span className="size-2.5 shrink-0 rounded-full border border-line" style={{ background: noteColor(note.color).hex }} aria-hidden />
                    {note.seal && !openNotes[note.id] ? <Lock className="size-3.5 shrink-0 text-copper" aria-label="Trancada" /> : null}
                    <Highlight text={note.title || "Sem título"} query={query} />
                  </span>
                  <span className="text-xs text-muted tabular-nums" data-tick={tick} suppressHydrationWarning>
                    Editado {relativeTime(note.updatedAt)}
                  </span>
                  <span className="line-clamp-2 text-sm text-muted">
                    {note.seal && !openNotes[note.id] ? "Trancada" : snippet(note, query) || "Sem texto"}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Excluir ${note.title || "nota"}`}
                  onClick={() => setConfirm({ kind: "delete", id: note.id })}
                  className="absolute top-2 right-2 grid size-11 place-items-center rounded-md text-muted hover:text-danger"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })
        )}
      </div>
      <p className="hidden border-t border-line px-3 py-3 text-xs text-muted lg:block">
        {shortcut}+K comandos · {shortcut}+N nova · setas na busca
      </p>
    </aside>
  );
}
