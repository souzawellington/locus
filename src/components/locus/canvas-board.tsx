import { Minus, Plus, Scan } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FigureHost } from "@/figures/FigureHost";
import { noteColor } from "@/lib/vault/appearance";
import { plainText, wikilinkTitles } from "@/lib/vault/markdown";
import { findNote, presentNotes } from "@/lib/vault/retrieve";
import { useVault } from "@/lib/vault/store";
import { cn } from "@/lib/utils";

export function CanvasBoard() {
  const notes = useVault((state) => state.notes);
  const openNotes = useVault((state) => state.openNotes);
  const activeId = useVault((state) => state.activeId);
  const moveCanvas = useVault((state) => state.moveCanvas);
  const select = useVault((state) => state.select);
  const placeOnCanvas = useVault((state) => state.placeOnCanvas);
  const stickers = useVault((state) => state.stickers);
  const moveSticker = useVault((state) => state.moveSticker);
  const removeSticker = useVault((state) => state.removeSticker);
  const boardRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [scale, setScale] = useState(1);
  const placed = useMemo(
    () => presentNotes(notes, openNotes).filter((note) => note.canvas),
    [notes, openNotes],
  );

  const edges = useMemo(() => {
    const lines: { key: string; x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const note of placed) {
      if (!note.canvas) continue;
      const hidden = Boolean(note.seal) && !openNotes[note.id];
      for (const title of wikilinkTitles(hidden ? "" : note.body)) {
        const target = findNote(placed, title);
        if (!target?.canvas || target.id === note.id) continue;
        const key = [note.id, target.id].sort().join(":");
        if (lines.some((line) => line.key === key)) continue;
        lines.push({
          key,
          x1: note.canvas.x + note.canvas.w / 2,
          y1: note.canvas.y + note.canvas.h / 2,
          x2: target.canvas.x + target.canvas.w / 2,
          y2: target.canvas.y + target.canvas.h / 2,
        });
      }
    }
    return lines;
  }, [placed, openNotes]);

  function fit() {
    const element = boardRef.current;
    if (!element || (!placed.length && !stickers.length)) return;
    const xs = [
      ...placed.flatMap((note) => (note.canvas ? [note.canvas.x, note.canvas.x + note.canvas.w] : [])),
      ...stickers.map((sticker) => sticker.x),
      ...stickers.map((sticker) => sticker.x + 180),
    ];
    const ys = [
      ...placed.flatMap((note) => (note.canvas ? [note.canvas.y, note.canvas.y + note.canvas.h] : [])),
      ...stickers.map((sticker) => sticker.y),
      ...stickers.map((sticker) => sticker.y + 150),
    ];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const padLeft = 28;
    const padRight = 76;
    const padTop = 28;
    const padBottom = 28;
    const availW = Math.max(1, element.clientWidth - padLeft - padRight);
    const availH = Math.max(1, element.clientHeight - padTop - padBottom);
    const spanW = Math.max(1, maxX - minX);
    const spanH = Math.max(1, maxY - minY);
    const next = Math.min(1.15, Math.max(0.42, Math.min(availW / spanW, availH / spanH)));
    setScale(next);
    setPan({
      x: padLeft + (availW - spanW * next) / 2 - minX * next,
      y: padTop + (availH - spanH * next) / 2 - minY * next,
    });
  }

  useEffect(() => {
    const element = boardRef.current;
    if (!element) return;
    fit();
    const observer = new ResizeObserver(() => fit());
    observer.observe(element);
    return () => observer.disconnect();
    // Refit when the set of cards changes or the board is resized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed.map((note) => note.id).join("|"), stickers.map((sticker) => sticker.id).join("|")]);

  useEffect(() => {
    const element = boardRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const worldX = (pointerX - pan.x) / scale;
      const worldY = (pointerY - pan.y) / scale;
      const next = Math.min(1.8, Math.max(0.35, scale * (event.deltaY < 0 ? 1.08 : 0.92)));
      setScale(next);
      setPan({ x: pointerX - worldX * next, y: pointerY - worldY * next });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [pan, scale]);

  function onBackgroundDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { ...pan };
    const move = (pointer: PointerEvent) => {
      setPan({ x: origin.x + pointer.clientX - startX, y: origin.y + pointer.clientY - startY });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onCardDown(event: React.PointerEvent<HTMLElement>, id: string, x: number, y: number) {
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (pointer: PointerEvent) => {
      moveCanvas(id, x + (pointer.clientX - startX) / scale, y + (pointer.clientY - startY) / scale);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="relative h-full min-h-0">
      <div className="absolute top-3 right-3 z-10 flex gap-2">
        <button type="button" aria-label="Diminuir" className="grid size-11 place-items-center rounded-md border border-line bg-paper-2" onClick={() => setScale((value) => Math.max(0.35, value / 1.1))}>
          <Minus className="size-4" />
        </button>
        <button type="button" aria-label="Aumentar" className="grid size-11 place-items-center rounded-md border border-line bg-paper-2" onClick={() => setScale((value) => Math.min(1.8, value * 1.1))}>
          <Plus className="size-4" />
        </button>
        <button type="button" aria-label="Enquadrar" className="grid size-11 place-items-center rounded-md border border-line bg-paper-2" onClick={fit}>
          <Scan className="size-4" />
        </button>
      </div>
      <div
        ref={boardRef}
        className="relative h-full touch-none overflow-hidden"
        onPointerDown={onBackgroundDown}
        style={{
          backgroundImage: "radial-gradient(circle, var(--line) 1.1px, transparent 1.1px)",
          backgroundSize: `${22 * scale}px ${22 * scale}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        <div
          className="absolute top-0 left-0"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: "0 0" }}
        >
          <svg className="pointer-events-none absolute top-0 left-0" width="1800" height="1400">
            {edges.map((edge) => (
              <line key={edge.key} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} stroke="var(--copper)" strokeOpacity="0.55" strokeWidth="1.5" />
            ))}
          </svg>
          {stickers.map((sticker) => (
            <div
              key={sticker.id}
              className="absolute z-10"
              style={{ left: sticker.x, top: sticker.y, width: 180 }}
              onPointerDown={(event) => {
                event.stopPropagation();
                const startX = event.clientX;
                const startY = event.clientY;
                const origin = { x: sticker.x, y: sticker.y };
                const move = (pointer: PointerEvent) => {
                  moveSticker(sticker.id, origin.x + (pointer.clientX - startX) / scale, origin.y + (pointer.clientY - startY) / scale);
                };
                const up = () => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
              }}
            >
              <FigureHost
                embed={{
                  slug: sticker.slug,
                  size: "sticker",
                  motion: sticker.animated ? "animated" : "still",
                  tilt: sticker.tilt,
                }}
                showExport={false}
              />
              <button
                type="button"
                aria-label="Tirar figurinha"
                className="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full border border-line bg-paper text-xs text-muted"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => removeSticker(sticker.id)}
              >
                ×
              </button>
            </div>
          ))}
          {placed.map((note) =>
            note.canvas ? (
              <article
                key={note.id}
                onPointerDown={(event) => onCardDown(event, note.id, note.canvas?.x ?? 0, note.canvas?.y ?? 0)}
                className={cn(
                  "absolute flex cursor-grab flex-col gap-2 overflow-hidden rounded-lg border p-3 shadow-sm",
                  note.id === activeId ? "border-copper" : "border-line",
                )}
                style={{ left: note.canvas.x, top: note.canvas.y, width: note.canvas.w, height: note.canvas.h, background: noteColor(note.color).hex, color: noteColor(note.color).ink }}
              >
                <h2 className="font-serif text-lg leading-tight">{note.title}</h2>
                <p className="line-clamp-4 text-sm leading-snug opacity-70">
                  {note.seal && !openNotes[note.id] ? "Nota trancada" : plainText(note.body)}
                </p>
                <button
                  type="button"
                  className="mt-auto h-10 self-start rounded-md px-2 text-sm text-copper"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => select(note.id)}
                >
                  Abrir
                </button>
              </article>
            ) : null,
          )}
        </div>
        {placed.length === 0 && stickers.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <p className="text-muted">Nenhuma nota no plano.</p>
            <button type="button" className="h-11 rounded-md bg-copper px-4 text-sm text-paper-2" onClick={() => activeId && placeOnCanvas(activeId)} disabled={!activeId}>
              Colocar a nota aberta
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
