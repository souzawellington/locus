import { Download, Eye, Frame, Lock, LockOpen, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { downloadText, exactTime, relativeTime, slugify, wordCount } from "@/lib/vault/format";
import { kindLabel, parseBlocks, serializeBlocks, wikilinkTitles, type MdBlock } from "@/lib/vault/markdown";
import { findNote, presentNotes } from "@/lib/vault/retrieve";
import { useVault } from "@/lib/vault/store";
import { cn } from "@/lib/utils";
import { MarkdownView } from "./markdown-view";
import { LockDialog, LockScreen } from "./note-lock";
import { VisualEditor } from "./visual-editor";

function BlockEditor({ body, onChange }: { body: string; onChange: (value: string) => void }) {
  const blocks = parseBlocks(body);

  function commit(next: MdBlock[]) {
    onChange(serializeBlocks(next));
  }

  function update(index: number, raw: string) {
    const next = blocks.map((block, blockIndex) => (blockIndex === index ? { ...block, raw } : block));
    commit(next);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(target, 0, item);
    commit(next);
  }

  function drop(index: number, from: number) {
    if (from === index || Number.isNaN(from)) return;
    const next = [...blocks];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(index, 0, item);
    commit(next);
  }

  if (!blocks.length) {
    return (
      <button type="button" className="h-11 rounded-md border border-line px-4 text-sm" onClick={() => onChange("Novo bloco")}>
        Adicionar o primeiro bloco
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, index) => (
        <article
          key={`${block.kind}-${index}`}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("text/plain", String(index));
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            drop(index, Number(event.dataTransfer.getData("text/plain")));
          }}
          className="rounded-md border border-line bg-paper-2 p-3"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs tracking-wide text-muted uppercase">{kindLabel(block.kind)}</span>
            <div className="ml-auto flex gap-1">
              <button type="button" className="h-11 rounded-md px-3 text-sm text-muted" onClick={() => move(index, -1)} disabled={index === 0}>
                Subir
              </button>
              <button
                type="button"
                className="h-11 rounded-md px-3 text-sm text-muted"
                onClick={() => move(index, 1)}
                disabled={index === blocks.length - 1}
              >
                Descer
              </button>
              <button
                type="button"
                className="h-11 rounded-md px-3 text-sm text-danger"
                onClick={() => commit(blocks.filter((_, blockIndex) => blockIndex !== index))}
              >
                Tirar
              </button>
            </div>
          </div>
          {block.kind === "rule" ? (
            <hr className="border-line" />
          ) : (
            <textarea
              value={block.raw}
              onChange={(event) => update(index, event.target.value)}
              rows={Math.min(10, Math.max(2, block.raw.split("\n").length))}
              className="w-full resize-none bg-transparent font-mono text-sm leading-relaxed text-ink outline-none"
              aria-label={`Bloco ${kindLabel(block.kind)}`}
            />
          )}
        </article>
      ))}
      <button type="button" className="h-11 self-start rounded-md border border-line px-4 text-sm" onClick={() => onChange(`${body.trim()}\n\nNovo bloco\n`)}>
        Novo bloco
      </button>
    </div>
  );
}

export function Editor() {
  const notes = useVault((state) => state.notes);
  const openNotes = useVault((state) => state.openNotes);
  const activeId = useVault((state) => state.activeId);
  const mode = useVault((state) => state.mode);
  const sourceChosen = useVault((state) => state.sourceChosen);
  const setMode = useVault((state) => state.setMode);
  const updateBody = useVault((state) => state.updateBody);
  const updateTitle = useVault((state) => state.updateTitle);
  const commitRename = useVault((state) => state.commitRename);
  const setConfirm = useVault((state) => state.setConfirm);
  const placeOnCanvas = useVault((state) => state.placeOnCanvas);
  const setView = useVault((state) => state.setView);
  const openWiki = useVault((state) => state.openWiki);
  const unlockAllNow = useVault((state) => state.unlockAllNow);
  const removeSeal = useVault((state) => state.removeSeal);
  const focusTick = useVault((state) => state.focusTick);
  const [lockOpen, setLockOpen] = useState(false);
  const note = notes.find((item) => item.id === activeId);
  const open = note ? openNotes[note.id] : undefined;
  const origin = useRef(open?.title ?? note?.title ?? "");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!focusTick) return;
    document.getElementById("locus-title")?.focus();
  }, [focusTick]);

  useEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.max(element.scrollHeight, 320)}px`;
  }, [open?.body, note?.body, mode]);

  if (!note) {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-4 px-6">
        <p className="font-serif text-3xl text-ink">Nenhuma nota aberta</p>
        <p className="max-w-md text-muted">Crie uma nota na lista ou com {typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent) ? "⌘" : "Ctrl"}+N.</p>
      </div>
    );
  }

  const shown = presentNotes(notes, openNotes);
  const reading = shown.find((item) => item.id === note.id) ?? note;
  const locked = Boolean(note.seal) && !open;
  const title = reading.title;
  const body = reading.body;
  const sessionOpen = Object.keys(openNotes).length > 0;
  const outgoing = wikilinkTitles(body)
    .map((label) => findNote(shown, label))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const incoming = shown.filter(
    (item) => item.id !== note.id && wikilinkTitles(item.body).some((label) => findNote(shown, label)?.id === note.id),
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8 md:px-8 md:py-12">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={mode === "read"}
            className={cn("inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm", mode === "read" ? "bg-copper-soft text-ink" : "text-muted")}
            onClick={() => setMode(mode === "read" ? "visual" : "read")}
          >
            <Eye className="size-4" />
            {mode === "read" ? "Editar" : "Leitura"}
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-muted"
            onClick={() => (note.canvas ? setView("canvas") : placeOnCanvas(note.id))}
          >
            <Frame className="size-4" />
            {note.canvas ? "Ver no canvas" : "Colocar no canvas"}
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-muted"
            onClick={() => downloadText(`${slugify(title)}.md`, `# ${title}\n\n${body.trim()}\n`)}
          >
            <Download className="size-4" />
            Exportar
          </button>
          {locked ? null : note.seal && open ? (
            <button type="button" className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-muted" onClick={() => void removeSeal(note.id)}>
              <LockOpen className="size-4" />
              Remover cadeado
            </button>
          ) : (
            <button type="button" className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-muted" onClick={() => setLockOpen(true)}>
              <Lock className="size-4" />
              Trancar nota
            </button>
          )}
          {sessionOpen ? (
            <button type="button" className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-ink" onClick={() => unlockAllNow()}>
              Trancar agora
            </button>
          ) : null}
          <button
            type="button"
            className="ml-auto inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-danger"
            onClick={() => setConfirm({ kind: "delete", id: note.id })}
          >
            <Trash2 className="size-4" />
            Excluir
          </button>
        </div>

        {locked ? (
          <>
            <h1 className="font-serif text-3xl text-ink md:text-4xl">{title}</h1>
            <LockScreen noteId={note.id} />
          </>
        ) : (
          <>
            <input
              id="locus-title"
              value={title}
              aria-label="Título"
              placeholder="Sem título"
              onFocus={() => {
                origin.current = title;
              }}
              onChange={(event) => updateTitle(note.id, event.target.value)}
              onBlur={(event) => commitRename(note.id, origin.current, event.target.value)}
              className="w-full bg-transparent font-serif text-3xl text-ink outline-none placeholder:text-muted md:text-4xl"
            />
            <p className="text-sm text-muted tabular-nums" suppressHydrationWarning>
              Editado {relativeTime(note.updatedAt)} · {exactTime(note.updatedAt)} · {wordCount(body)} {wordCount(body) === 1 ? "palavra" : "palavras"}
              {note.seal ? " · aberta nesta sessão" : ""}
            </p>
            {mode === "read" ? (
              <MarkdownView markdown={body} onWiki={openWiki} noteId={note.id} />
            ) : mode === "blocks" ? (
              <BlockEditor body={body} onChange={(next) => updateBody(note.id, next)} />
            ) : sourceChosen && mode === "source" ? (
              <textarea
                id="locus-body"
                ref={bodyRef}
                value={body}
                aria-label="Código da nota"
                placeholder="Código da nota. O editor visual continua sendo o padrão."
                onChange={(event) => updateBody(note.id, event.target.value)}
                className="w-full resize-none bg-transparent font-mono text-sm leading-7 text-ink outline-none placeholder:text-muted"
              />
            ) : (
              <VisualEditor noteId={note.id} body={body} onChange={(next) => updateBody(note.id, next)} />
            )}
          </>
        )}

        {!locked && outgoing.length + incoming.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <p className="text-xs tracking-wide text-muted uppercase">Ligações</p>
            <div className="flex flex-wrap gap-2">
              {outgoing.map((item) => (
                <button key={`out-${item.id}`} type="button" className="h-10 rounded-full border border-line px-3 text-sm" onClick={() => openWiki(item.title)}>
                  {item.seal && !openNotes[item.id] ? "Nota trancada" : item.title}
                </button>
              ))}
              {incoming.map((item) => (
                <button key={`in-${item.id}`} type="button" className="h-10 rounded-full bg-copper-soft px-3 text-sm" onClick={() => openWiki(item.title)}>
                  ← {item.seal && !openNotes[item.id] ? "Nota trancada" : item.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {lockOpen ? <LockDialog noteId={note.id} onClose={() => setLockOpen(false)} /> : null}
    </div>
  );
}
