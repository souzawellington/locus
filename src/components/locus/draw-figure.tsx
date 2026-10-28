import { useState } from "react";
import { FigureHost } from "@/figures/FigureHost";
import { buildFigureRac } from "@/figures/idea/context";
import { validateAndRepair } from "@/figures/idea/compile";
import { fallbackFor } from "@/figures/idea/examples";
import type { FigureIdeaSpec } from "@/figures/idea/schema";
import { askFigure, figureReady } from "@/lib/vault/figure-ask";
import { noteIsLocked } from "@/lib/vault/seal";
import { useVault } from "@/lib/vault/store";
import { ApproveLine } from "./approve";

export function DrawFigure({ open, onClose }: { open: boolean; onClose: () => void }) {
  const notes = useVault((state) => state.notes);
  const openNotes = useVault((state) => state.openNotes);
  const activeId = useVault((state) => state.activeId);
  const theme = useVault((state) => state.theme);
  const saveScene = useVault((state) => state.saveScene);
  const insertFigure = useVault((state) => state.insertFigure);
  const [request, setRequest] = useState("");
  const [spec, setSpec] = useState<FigureIdeaSpec | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [approve, setApprove] = useState(false);

  if (!open) return null;

  async function draw() {
    setBusy(true);
    setApprove(false);
    const active = notes.find((item) => item.id === activeId);
    const ask = (request.trim() || (!noteIsLocked(active) ? active?.title : "") || "uma bancada com uma peça que corre").slice(0, 500);
    if (noteIsLocked(active)) {
      setSpec(fallbackFor(ask));
      setNote("Desenhei uma máquina daqui.");
      setBusy(false);
      return;
    }
    const rac = buildFigureRac(notes, openNotes, activeId, theme);
    try {
      const ready = await figureReady();
      if (!ready.enabled) {
        setSpec(fallbackFor(ask));
        setNote("Desenhei uma máquina daqui.");
        return;
      }
      const outcome = await askFigure({ data: { ...rac, userRequest: ask } });
      setSpec(outcome.spec);
      setNote(outcome.kind === "fallback" ? "Desenhei uma máquina daqui." : "");
    } catch {
      setSpec(fallbackFor(ask));
      setNote("Desenhei uma máquina daqui.");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setApprove(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="draw-figure-title">
      <button type="button" aria-label="Fechar figura" className="absolute inset-0 bg-ink/40" onClick={close} />
      <div className="relative z-10 m-4 flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-line bg-paper text-ink">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h2 id="draw-figure-title" className="font-serif text-2xl">
            Desenhar figura
          </h2>
          <button type="button" className="ml-auto h-9 rounded-md px-3 text-sm text-muted" onClick={close}>
            Fechar
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <label className="flex flex-col gap-1 text-sm" htmlFor="draw-figure-request">
            O que a figura mostra
            <textarea
              id="draw-figure-request"
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              rows={3}
              className="rounded-md border border-line bg-paper-2 px-3 py-2 text-base"
              placeholder="Um relógio comparador numa haste."
            />
          </label>
          <button type="button" className="mt-3 h-11 rounded-md bg-copper px-4 text-sm text-paper-2" disabled={busy} onClick={() => void draw()}>
            {busy ? "A desenhar…" : "Desenhar"}
          </button>
          {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}
          {spec ? (
            <div className="mt-4">
              <FigureHost embed={{ slug: spec.id, size: "full", motion: "still", tilt: 0 }} showExport scene={spec} />
            </div>
          ) : null}
        </div>
        {spec ? (
          <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
            <button type="button" className="h-11 rounded-md bg-copper px-4 text-sm text-paper-2" onClick={() => setApprove(true)}>
              Colocar na nota
            </button>
            <button type="button" className="h-11 rounded-md px-4 text-sm text-muted" onClick={close}>
              Agora não
            </button>
          </div>
        ) : null}
      </div>
      {approve && spec ? (
        <ApproveLine
          sentence="Colocar esta figura na nota?"
          yesLabel="Aprovar na Nota"
          noLabel="Recusar"
          onYes={() => {
            const verdict = validateAndRepair(spec);
            if (!verdict.accepted || !verdict.spec) {
              setNote("Não deu para desenhar esta figura.");
              setApprove(false);
              return;
            }
            const id = saveScene(verdict.spec);
            insertFigure(id);
            setApprove(false);
            close();
          }}
          onNo={() => setApprove(false)}
        />
      ) : null}
    </div>
  );
}
