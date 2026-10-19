import { Code2, Download, Eye, Frame, Rows3, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FIGURES } from "@/figures/geometry/machines";
import { downloadText, exactTime, relativeTime, slugify, wordCount } from "@/lib/vault/format";
import { kindLabel, parseBlocks, serializeBlocks, wikilinkTitles, type MdBlock } from "@/lib/vault/markdown";
import { findNote } from "@/lib/vault/retrieve";
import { useVault } from "@/lib/vault/store";
import type { WriteMode } from "@/lib/vault/types";
import { cn } from "@/lib/utils";
import { MarkdownView } from "./markdown-view";

const modes: { id: WriteMode; label: string; icon: typeof Code2 }[] = [
  { id: "source", label: "Fonte", icon: Code2 },
  { id: "blocks", label: "Blocos", icon: Rows3 },
  { id: "read", label: "Leitura", icon: Eye },
];

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
  const activeId = useVault((state) => state.activeId);
  const mode = useVault((state) => state.mode);
  const setMode = useVault((state) => state.setMode);
  const updateBody = useVault((state) => state.updateBody);
  const updateTitle = useVault((state) => state.updateTitle);
  const commitRename = useVault((state) => state.commitRename);
  const setConfirm = useVault((state) => state.setConfirm);
  const placeOnCanvas = useVault((state) => state.placeOnCanvas);
  const insertFigure = useVault((state) => state.insertFigure);
  const [figuresOpen, setFiguresOpen] = useState(false);
  const setView = useVault((state) => state.setView);
  const openWiki = useVault((state) => state.openWiki);
  const focusTick = useVault((state) => state.focusTick);
  const note = notes.find((item) => item.id === activeId);
  const origin = useRef(note?.title ?? "");
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
  }, [note?.body, mode]);

  if (!note) {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-4 px-6">
        <p className="font-serif text-3xl text-ink">Nenhuma nota aberta</p>
        <p className="max-w-md text-muted">Crie uma nota na lista ou com {typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent) ? "⌘" : "Ctrl"}+N.</p>
      </div>
    );
  }

  const outgoing = wikilinkTitles(note.body)
    .map((title) => findNote(notes, title))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const incoming = notes.filter(
    (item) => item.id !== note.id && wikilinkTitles(item.body).some((title) => findNote(notes, title)?.id === note.id),
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8 md:px-8 md:py-12">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-line p-1" role="group" aria-label="Modo de escrita">
            {modes.map((item) => {
              const Icon = item.icon;
              const active = mode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setMode(item.id)}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-sm px-3 text-sm",
                    active ? "bg-copper text-paper-2" : "text-muted",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
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
            onClick={() => downloadText(`${slugify(note.title)}.md`, `# ${note.title}\n\n${note.body.trim()}\n`)}
          >
            <Download className="size-4" />
            Exportar
          </button>
          <button
            type="button"
            aria-expanded={figuresOpen}
            className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-muted"
            onClick={() => setFiguresOpen((open) => !open)}
          >
            Figura
          </button>
          <button
            type="button"
            className="ml-auto inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-danger"
            onClick={() => setConfirm({ kind: "delete", id: note.id })}
          >
            <Trash2 className="size-4" />
            Excluir
          </button>
        </div>
        {figuresOpen ? (
          <div className="flex flex-wrap gap-2" role="list" aria-label="Figuras">
            {FIGURES.map((figure) => (
              <button
                key={figure.slug}
                type="button"
                className="h-10 rounded-full border border-line px-3 text-sm text-ink"
                onClick={() => {
                  insertFigure(figure.slug);
                  setFiguresOpen(false);
                }}
              >
                {figure.title}
              </button>
            ))}
          </div>
        ) : null}

        <input
          id="locus-title"
          value={note.title}
          aria-label="Título"
          placeholder="Sem título"
          onFocus={() => {
            origin.current = note.title;
          }}
          onChange={(event) => updateTitle(note.id, event.target.value)}
          onBlur={(event) => commitRename(note.id, origin.current, event.target.value)}
          className="w-full bg-transparent font-serif text-3xl text-ink outline-none placeholder:text-muted md:text-4xl"
        />
        <p className="text-sm text-muted tabular-nums" suppressHydrationWarning>
          Editado {relativeTime(note.updatedAt)} · {exactTime(note.updatedAt)} · {wordCount(note.body)}{" "}
          {wordCount(note.body) === 1 ? "palavra" : "palavras"}
        </p>

        {mode === "read" ? (
          <MarkdownView markdown={note.body} onWiki={openWiki} />
        ) : mode === "blocks" ? (
          <BlockEditor body={note.body} onChange={(body) => updateBody(note.id, body)} />
        ) : (
          <textarea
            id="locus-body"
            ref={bodyRef}
            value={note.body}
            aria-label="Markdown"
            placeholder="Escreva em markdown. Ligue ideias com [[outra nota]]. Uma figura entra como ![[figure:wikilinks]]."
            onChange={(event) => updateBody(note.id, event.target.value)}
            className="w-full resize-none bg-transparent font-sans text-base leading-7 text-ink outline-none placeholder:text-muted"
          />
        )}

        {outgoing.length + incoming.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <p className="text-xs tracking-wide text-muted uppercase">Ligações</p>
            <div className="flex flex-wrap gap-2">
              {outgoing.map((item) => (
                <button key={`out-${item.id}`} type="button" className="h-10 rounded-full border border-line px-3 text-sm" onClick={() => openWiki(item.title)}>
                  {item.title}
                </button>
              ))}
              {incoming.map((item) => (
                <button key={`in-${item.id}`} type="button" className="h-10 rounded-full bg-copper-soft px-3 text-sm" onClick={() => openWiki(item.title)}>
                  ← {item.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
