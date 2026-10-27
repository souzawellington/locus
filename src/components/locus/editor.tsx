import { Download, Eraser, Eye, Frame, Lock, LockOpen, PenLine, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  exportHtml,
  exportJson,
  exportMarkdown,
  exportNotebook,
  exportPlain,
  exportSvg,
  NOTE_COLORS,
  NOTE_FONTS,
  noteColor,
  noteFont,
  strokePath,
} from "@/lib/vault/appearance";
import { downloadText, exactTime, relativeTime, wordCount } from "@/lib/vault/format";
import {
  kindLabel,
  parseBlocks,
  serializeBlocks,
  wikilinkTitles,
  type MdBlock,
} from "@/lib/vault/markdown";
import { findNote, presentNotes } from "@/lib/vault/retrieve";
import { useVault } from "@/lib/vault/store";
import type { InkPoint, InkStroke, Note, NoteFont } from "@/lib/vault/types";
import { cn } from "@/lib/utils";
import { ApproveLine } from "./approve";
import { MarkdownView } from "./markdown-view";
import { LockDialog, LockScreen } from "./note-lock";
import { VisualEditor } from "./visual-editor";

function BlockEditor({ body, onChange }: { body: string; onChange: (value: string) => void }) {
  const blocks = parseBlocks(body);

  function commit(next: MdBlock[]) {
    onChange(serializeBlocks(next));
  }

  function update(index: number, raw: string) {
    const next = blocks.map((block, blockIndex) =>
      blockIndex === index ? { ...block, raw } : block,
    );
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
      <button
        type="button"
        className="h-11 rounded-md border border-line px-4 text-sm"
        onClick={() => onChange("Novo bloco")}
      >
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
            <span className="text-xs tracking-wide text-muted uppercase">
              {kindLabel(block.kind)}
            </span>
            <div className="ml-auto flex gap-1">
              <button
                type="button"
                className="h-11 rounded-md px-3 text-sm text-muted"
                onClick={() => move(index, -1)}
                disabled={index === 0}
              >
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
      <button
        type="button"
        className="h-11 self-start rounded-md border border-line px-4 text-sm"
        onClick={() => onChange(`${body.trim()}\n\nNovo bloco\n`)}
      >
        Novo bloco
      </button>
    </div>
  );
}

function localPoint(event: PointerEvent<HTMLDivElement>, element: HTMLElement): InkPoint {
  const rect = element.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    p: event.pressure && event.pressure > 0 ? event.pressure : 0.5,
  };
}

function InkLayer({
  strokes,
  color,
  enabled,
  eraser,
  onChange,
}: {
  strokes: InkStroke[];
  color: string;
  enabled: boolean;
  eraser: boolean;
  onChange: (ink: InkStroke[]) => void;
}) {
  const board = useRef<HTMLDivElement>(null);
  const drawing = useRef<InkStroke | null>(null);
  const penActive = useRef(false);
  const [live, setLive] = useState<InkStroke | null>(null);

  function commit(next: InkStroke[]) {
    onChange(next);
    drawing.current = null;
    setLive(null);
  }

  function onDown(event: PointerEvent<HTMLDivElement>) {
    if (!enabled || !board.current) return;
    if (event.pointerType === "touch" && penActive.current) return;
    if (event.pointerType === "pen") penActive.current = true;
    event.preventDefault();
    board.current.setPointerCapture(event.pointerId);
    const point = localPoint(event, board.current);
    if (eraser) {
      commit(
        strokes.filter(
          (stroke) =>
            !stroke.points.some((item) => Math.hypot(item.x - point.x, item.y - point.y) < 18),
        ),
      );
      return;
    }
    drawing.current = { color, size: 1.6 + point.p * 2.4, points: [point] };
    setLive(drawing.current);
  }

  function onMove(event: PointerEvent<HTMLDivElement>) {
    if (!enabled || !board.current || !drawing.current) return;
    if (event.pointerType === "touch" && penActive.current) return;
    const point = localPoint(event, board.current);
    drawing.current = { ...drawing.current, points: [...drawing.current.points, point] };
    setLive(drawing.current);
  }

  function onUp(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "pen") penActive.current = false;
    if (!drawing.current) return;
    if (drawing.current.points.length > 1) commit([...strokes, drawing.current]);
    else {
      drawing.current = null;
      setLive(null);
    }
  }

  const shown = live ? [...strokes, live] : strokes;

  return (
    <div
      ref={board}
      className={cn("absolute inset-0", enabled ? "z-10 touch-none" : "pointer-events-none")}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <svg className="h-full w-full" aria-hidden>
        {shown.map((stroke, index) => (
          <path
            key={`${index}-${stroke.points.length}`}
            d={strokePath(stroke)}
            fill="none"
            stroke={stroke.color}
            strokeWidth={stroke.size}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
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
  const setFigureOpen = useVault((state) => state.setFigureOpen);
  const placeOnCanvas = useVault((state) => state.placeOnCanvas);
  const setView = useVault((state) => state.setView);
  const openWiki = useVault((state) => state.openWiki);
  const unlockAllNow = useVault((state) => state.unlockAllNow);
  const removeSeal = useVault((state) => state.removeSeal);
  const focusTick = useVault((state) => state.focusTick);
  const cells = useVault((state) => state.cells);
  const setLook = useVault((state) => state.setLook);
  const setInk = useVault((state) => state.setInk);
  const [lockOpen, setLockOpen] = useState(false);
  const [pen, setPen] = useState(false);
  const [eraser, setEraser] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [pendingExport, setPendingExport] = useState<{
    filename: string;
    text: string;
    type: string;
  } | null>(null);
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
        <p className="max-w-md text-muted">
          Crie uma nota na lista ou com{" "}
          {typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent) ? "⌘" : "Ctrl"}+N.
        </p>
      </div>
    );
  }

  const shown = presentNotes(notes, openNotes);
  const reading = shown.find((item) => item.id === note.id) ?? note;
  const locked = Boolean(note.seal) && !open;
  const title = reading.title;
  const body = reading.body;
  const sessionOpen = Object.keys(openNotes).length > 0;
  const look = noteColor(reading.color);
  const font = noteFont(reading.font);
  const ink = reading.ink ?? [];
  const pageNote: Note = { ...reading, title, body, ink, color: look.id, font: font.id };
  const outgoing = wikilinkTitles(body)
    .map((label) => findNote(shown, label))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const incoming = shown.filter(
    (item) =>
      item.id !== note.id &&
      wikilinkTitles(item.body).some((label) => findNote(shown, label)?.id === note.id),
  );

  function askExport(file: { filename: string; text: string }, type: string) {
    setExportOpen(false);
    setPendingExport({ filename: file.filename, text: file.text, type });
  }

  return (
    <div className="h-full overflow-y-auto">
      <div
        className="relative mx-auto my-4 flex min-h-[calc(100%-2rem)] w-full max-w-3xl flex-col gap-6 rounded-lg border border-line px-5 py-7 shadow-sm md:my-8 md:px-10 md:py-12"
        style={{ background: look.hex, color: look.ink, fontFamily: font.css }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={mode === "read"}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm",
              mode === "read" ? "bg-black/10" : "text-current/70",
            )}
            onClick={() => {
              setPen(false);
              setMode(mode === "read" ? "visual" : "read");
            }}
          >
            <Eye className="size-4" />
            {mode === "read" ? "Editar" : "Leitura"}
          </button>
          <button
            type="button"
            aria-pressed={pen}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm",
              pen ? "bg-black/10" : "text-current/70",
            )}
            onClick={() => {
              setPen((value) => !value);
              setEraser(false);
            }}
          >
            <PenLine className="size-4" />
            Caneta
          </button>
          {pen ? (
            <>
              <button
                type="button"
                aria-pressed={eraser}
                className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-current/70"
                onClick={() => setEraser((value) => !value)}
              >
                <Eraser className="size-4" />
                {eraser ? "Apagando" : "Borracha"}
              </button>
              <button
                type="button"
                className="h-10 rounded-md px-3 text-sm text-current/70"
                onClick={() => setInk(note.id, [])}
              >
                Limpar tinta
              </button>
            </>
          ) : null}
          <div className="relative">
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-current/70"
              onClick={() => setExportOpen((value) => !value)}
            >
              <Download className="size-4" />
              Exportar
            </button>
            {exportOpen ? (
              <div className="absolute top-11 left-0 z-20 w-56 rounded-md border border-line bg-paper p-1 text-ink shadow-md">
                <button
                  type="button"
                  className="block h-10 w-full rounded-sm px-3 text-left text-sm"
                  onClick={() => askExport(exportMarkdown(pageNote), "text/markdown")}
                >
                  Markdown
                </button>
                <button
                  type="button"
                  className="block h-10 w-full rounded-sm px-3 text-left text-sm"
                  onClick={() => askExport(exportHtml(pageNote), "text/html")}
                >
                  HTML
                </button>
                <button
                  type="button"
                  className="block h-10 w-full rounded-sm px-3 text-left text-sm"
                  onClick={() => askExport(exportPlain(pageNote), "text/plain")}
                >
                  Texto
                </button>
                <button
                  type="button"
                  className="block h-10 w-full rounded-sm px-3 text-left text-sm"
                  onClick={() => askExport(exportJson(pageNote), "application/json")}
                >
                  JSON
                </button>
                <button
                  type="button"
                  className="block h-10 w-full rounded-sm px-3 text-left text-sm"
                  onClick={() => askExport(exportSvg(pageNote), "image/svg+xml")}
                >
                  SVG da página
                </button>
                <button
                  type="button"
                  className="block h-10 w-full rounded-sm px-3 text-left text-sm"
                  onClick={() => askExport(exportNotebook(cells), "application/json")}
                >
                  Caderno JSON
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-current/70"
            onClick={() => setFigureOpen(true)}
          >
            Desenhar figura
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-current/70"
            onClick={() => (note.canvas ? setView("canvas") : placeOnCanvas(note.id))}
          >
            <Frame className="size-4" />
            {note.canvas ? "Ver no canvas" : "Colocar no canvas"}
          </button>
          {locked ? null : note.seal && open ? (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-current/70"
              onClick={() => void removeSeal(note.id)}
            >
              <LockOpen className="size-4" />
              Remover cadeado
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-current/70"
              onClick={() => setLockOpen(true)}
            >
              <Lock className="size-4" />
              Trancar nota
            </button>
          )}
          {sessionOpen ? (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm"
              onClick={() => unlockAllNow()}
            >
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

        {!locked ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1" role="group" aria-label="Cor da nota">
              {NOTE_COLORS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={item.label}
                  aria-pressed={look.id === item.id}
                  onClick={() => setLook(note.id, { color: item.id })}
                  className={cn(
                    "size-7 rounded-full border",
                    look.id === item.id ? "border-current" : "border-black/15",
                  )}
                  style={{ background: item.hex }}
                />
              ))}
            </div>
            <select
              value={font.id}
              aria-label="Fonte da nota"
              onChange={(event) => setLook(note.id, { font: event.target.value as NoteFont })}
              className="h-10 rounded-md border border-black/10 bg-transparent px-2 text-sm"
            >
              {NOTE_FONTS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {locked ? (
          <>
            <h1 className="text-3xl md:text-4xl">{title}</h1>
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
              className="w-full bg-transparent text-3xl outline-none placeholder:text-current/35 md:text-4xl"
            />
            <p className="text-sm text-current/50 tabular-nums" suppressHydrationWarning>
              Editado {relativeTime(note.updatedAt)} · {exactTime(note.updatedAt)} ·{" "}
              {wordCount(body)} {wordCount(body) === 1 ? "palavra" : "palavras"}
              {note.seal ? " · aberta nesta sessão" : ""}
            </p>
            <div className="relative min-h-[28rem]">
              {mode === "read" ? (
                <div className="note-prose">
                  <MarkdownView markdown={body} onWiki={openWiki} noteId={note.id} />
                </div>
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
                  className="w-full resize-none bg-transparent font-mono text-sm leading-7 outline-none placeholder:text-current/35"
                />
              ) : (
                <VisualEditor
                  noteId={note.id}
                  body={body}
                  onChange={(next) => updateBody(note.id, next)}
                />
              )}
              <InkLayer
                strokes={ink}
                color={look.ink}
                enabled={pen && !locked}
                eraser={eraser}
                onChange={(next) => setInk(note.id, next)}
              />
            </div>
          </>
        )}

        {!locked && outgoing.length + incoming.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-current/10 pt-4">
            <p className="text-xs tracking-wide text-current/50 uppercase">Ligações</p>
            <div className="flex flex-wrap gap-2">
              {outgoing.map((item) => (
                <button
                  key={`out-${item.id}`}
                  type="button"
                  className="h-10 rounded-full border border-current/15 px-3 text-sm"
                  onClick={() => openWiki(item.title)}
                >
                  {item.seal && !openNotes[item.id] ? "Nota trancada" : item.title}
                </button>
              ))}
              {incoming.map((item) => (
                <button
                  key={`in-${item.id}`}
                  type="button"
                  className="h-10 rounded-full bg-black/5 px-3 text-sm"
                  onClick={() => openWiki(item.title)}
                >
                  ← {item.seal && !openNotes[item.id] ? "Nota trancada" : item.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {lockOpen ? <LockDialog noteId={note.id} onClose={() => setLockOpen(false)} /> : null}
      {pendingExport ? (
        <ApproveLine
          sentence="Exportar este arquivo?"
          onYes={() => {
            downloadText(pendingExport.filename, pendingExport.text, pendingExport.type);
            setPendingExport(null);
          }}
          onNo={() => setPendingExport(null)}
        />
      ) : null}
    </div>
  );
}
