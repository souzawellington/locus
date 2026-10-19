import { useRef, useState } from "react";
import { FigureHost } from "@/figures/FigureHost";
import { exportFigure, type ExportKind } from "@/figures/export-client";
import { FIGURES } from "@/figures/geometry/machines";
import { formatFigureEmbed } from "@/lib/vault/markdown";
import { useVault } from "@/lib/vault/store";

const TILTS = [-3, 2, -1, 2, -2, 1, -2, 1];

export function StickerDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insertFigure = useVault((state) => state.insertFigure);
  const placeSticker = useVault((state) => state.placeSticker);
  const [animated, setAnimated] = useState(true);
  const previews = useRef(new Map<string, HTMLDivElement>());
  if (!open) return null;

  function save(slug: string, kind: ExportKind) {
    const node = previews.current.get(slug);
    if (node) void exportFigure(node, slug, kind);
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Fechar figurinhas" className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-[min(100%,24rem)] flex-col border-l border-line bg-paper shadow-lg" aria-label="Figurinhas">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h2 className="font-serif text-2xl text-ink">Figurinhas</h2>
          <button
            type="button"
            aria-pressed={animated}
            className="ml-auto h-9 rounded-full border border-line px-3 text-xs text-ink"
            onClick={() => setAnimated((value) => !value)}
          >
            {animated ? "Animadas" : "Paradas"}
          </button>
          <button type="button" className="h-9 rounded-md px-2 text-sm text-muted" onClick={onClose}>
            Fechar
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="mb-4 text-sm leading-relaxed text-muted">
            Cada figurinha é uma máquina do cofre. Solte na nota aberta ou no canvas. A exportação fica neste dispositivo.
          </p>
          <ul className="flex flex-col gap-4">
            {FIGURES.map((figure, index) => {
              const tilt = TILTS[index % TILTS.length] ?? 0;
              const embed = {
                slug: figure.slug,
                size: "sticker" as const,
                motion: animated ? ("animated" as const) : ("still" as const),
                tilt,
              };
              return (
                <li key={figure.slug} className="rounded-lg border border-line bg-paper-2 p-3">
                  <div
                    ref={(node) => {
                      if (node) previews.current.set(figure.slug, node);
                      else previews.current.delete(figure.slug);
                    }}
                    className="flex justify-center py-2"
                  >
                    <FigureHost embed={embed} showExport={false} />
                  </div>
                  <p className="font-serif text-lg text-ink">{figure.title}</p>
                  <p className="text-xs leading-snug text-muted">{figure.blurb}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="h-9 rounded-md bg-copper px-3 text-xs text-paper-2"
                      onClick={() => {
                        insertFigure(figure.slug, embed);
                        onClose();
                      }}
                    >
                      Na nota
                    </button>
                    <button
                      type="button"
                      className="h-9 rounded-md border border-line px-3 text-xs text-ink"
                      onClick={() => {
                        placeSticker({ slug: figure.slug, animated, tilt });
                        onClose();
                      }}
                    >
                      No canvas
                    </button>
                    <button type="button" className="h-9 rounded-md px-2 text-xs text-muted" onClick={() => save(figure.slug, "svg")}>
                      SVG
                    </button>
                    <button type="button" className="h-9 rounded-md px-2 text-xs text-muted" onClick={() => save(figure.slug, "png-512")}>
                      PNG
                    </button>
                    <button type="button" className="h-9 rounded-md px-2 text-xs text-muted" onClick={() => save(figure.slug, "svg-animated")}>
                      Animado
                    </button>
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-muted">{formatFigureEmbed(embed)}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}
