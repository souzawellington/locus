import { useEffect, useMemo, useRef, useState } from "react";
import { wikilinkTitles } from "@/lib/vault/markdown";
import { fold, presentNotes } from "@/lib/vault/retrieve";
import { useVault } from "@/lib/vault/store";

type GraphNode = { id: string; title: string; x: number; y: number };

function layoutNodes(notes: { id: string; title: string }[], width: number, height: number, previous: Map<string, GraphNode>, pinned: Set<string>): GraphNode[] {
  const count = Math.max(1, notes.length);
  const radius = Math.max(130, Math.min(width, height) / 2 - 88);
  const cx = width / 2;
  const cy = height / 2;
  return notes.map((note, index) => {
    const existing = previous.get(note.id);
    if (existing && pinned.has(note.id)) return { ...existing, title: note.title };
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
    return {
      id: note.id,
      title: note.title,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius * 0.92,
    };
  });
}

export function GraphView() {
  const stored = useVault((state) => state.notes);
  const openNotes = useVault((state) => state.openNotes);
  const notes = useMemo(() => presentNotes(stored, openNotes), [stored, openNotes]);
  const theme = useVault((state) => state.theme);
  const select = useVault((state) => state.select);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const pinned = useRef(new Set<string>());
  const drawRef = useRef<() => void>(() => {});
  const drag = useRef<{ id: string; moved: boolean } | null>(null);
  const [picked, setPicked] = useState("");

  const edges = useMemo(() => {
    const byTitle = new Map(notes.map((note) => [fold(note.title), note.id]));
    const pairs: [string, string][] = [];
    const seen = new Set<string>();
    for (const note of notes) {
      for (const title of wikilinkTitles(note.seal && !openNotes[note.id] ? "" : note.body)) {
        const target = byTitle.get(fold(title));
        if (!target || target === note.id) continue;
        const key = [note.id, target].sort().join(":");
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push([note.id, target]);
      }
    }
    return pairs;
  }, [notes, openNotes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const previous = new Map(nodesRef.current.map((node) => [node.id, node]));
      nodesRef.current = layoutNodes(notes, width, height, previous, pinned.current);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const styles = getComputedStyle(document.documentElement);
      const ink = styles.getPropertyValue("--ink").trim();
      const copper = styles.getPropertyValue("--copper").trim();
      const paper = styles.getPropertyValue("--paper").trim();
      const paper2 = styles.getPropertyValue("--paper-2").trim();
      const line = styles.getPropertyValue("--line").trim();
      context.clearRect(0, 0, width, height);
      context.fillStyle = paper;
      context.fillRect(0, 0, width, height);
      context.lineWidth = 1.4;
      for (const [from, to] of edges) {
        const a = nodesRef.current.find((node) => node.id === from);
        const b = nodesRef.current.find((node) => node.id === to);
        if (!a || !b) continue;
        context.strokeStyle = a.id === picked || b.id === picked ? copper : line;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
      context.font = "13px IBM Plex Sans, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "top";
      for (const node of nodesRef.current) {
        const selected = node.id === picked;
        context.beginPath();
        context.fillStyle = selected ? copper : paper2;
        context.strokeStyle = selected ? copper : line;
        context.lineWidth = selected ? 2 : 1.2;
        context.arc(node.x, node.y, selected ? 9 : 7, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        let label = node.title;
        const max = 148;
        if (context.measureText(label).width > max) {
          while (label.length > 1 && context.measureText(`${label}…`).width > max) label = label.slice(0, -1);
          label = `${label}…`;
        }
        context.fillStyle = ink;
        context.fillText(label, node.x, node.y + 16);
      }
    };

    drawRef.current = draw;
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [notes, edges, theme, picked]);

  function pointer(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function nearest(x: number, y: number) {
    let best: GraphNode | null = null;
    let bestDist = 64;
    for (const node of nodesRef.current) {
      const dist = Math.hypot(node.x - x, node.y - y);
      if (dist < bestDist) {
        best = node;
        bestDist = dist;
      }
    }
    return best;
  }

  const pickedNote = notes.find((note) => note.id === picked) ?? notes[0];

  return (
    <div className="relative h-full min-h-0">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        onPointerDown={(event) => {
          const point = pointer(event);
          const node = nearest(point.x, point.y);
          if (!node) return;
          drag.current = { id: node.id, moved: false };
          setPicked(node.id);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current) return;
          current.moved = true;
          pinned.current.add(current.id);
          const point = pointer(event);
          const node = nodesRef.current.find((item) => item.id === current.id);
          if (!node) return;
          node.x = point.x;
          node.y = point.y;
          drawRef.current();
        }}
        onPointerUp={(event) => {
          const current = drag.current;
          drag.current = null;
          if (current && !current.moved && event.detail === 2) select(current.id);
        }}
      />
      <div className="pointer-events-none absolute top-3 left-3 max-w-sm rounded-md border border-line bg-paper-2/95 px-3 py-2 text-sm text-muted">
        Clique um nó. Clique duplo abre a nota. Arrastar fixa a posição.
      </div>
      {picked ? (
        <div className="absolute right-3 bottom-3 left-3 flex items-center gap-3 rounded-lg border border-line bg-paper-2 p-3 md:left-auto md:max-w-md">
          <div className="min-w-0">
            <p className="truncate font-serif text-lg text-ink">{pickedNote.title}</p>
            <p className="text-xs text-muted">Ligações por [[título]]</p>
          </div>
          <button type="button" className="ml-auto h-11 shrink-0 rounded-md bg-copper px-4 text-sm text-paper-2" onClick={() => select(pickedNote.id)}>
            Abrir
          </button>
        </div>
      ) : null}
    </div>
  );
}
