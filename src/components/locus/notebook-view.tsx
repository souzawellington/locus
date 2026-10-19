import { Plus, Trash2 } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatValue, isChart, runNotebook } from "@/lib/vault/notebook";
import { useVault } from "@/lib/vault/store";

export function NotebookView() {
  const cells = useVault((state) => state.cells);
  const updateCell = useVault((state) => state.updateCell);
  const addCell = useVault((state) => state.addCell);
  const removeCell = useVault((state) => state.removeCell);
  const { runs } = runNotebook(cells);
  const sequence = cells
    .map((cell) => ({ cell, run: runs[cell.id] }))
    .filter((item) => item.run && item.run.order >= 0 && item.run.defines.length)
    .sort((a, b) => (a.run?.order ?? 0) - (b.run?.order ?? 0));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8 md:px-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-3xl text-ink">Caderno</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            A ordem de execução segue o grafo de dependências, não a posição na página. O ambiente é refeito a partir do código visível — sem estado escondido de uma corrida anterior.
          </p>
          {sequence.length > 0 ? (
            <p className="font-mono text-xs text-copper">
              execução: {sequence.map((item) => item.run?.defines.join(", ")).join(" → ")}
            </p>
          ) : null}
        </div>
        {cells.map((cell, index) => {
          const run = runs[cell.id];
          const chart = run?.display && isChart(run.display) ? run.display : null;
          return (
            <article key={cell.id} className="overflow-hidden rounded-lg border border-line bg-paper-2">
              <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-xs text-muted">
                <span className="tabular-nums">célula {index + 1}</span>
                <span>{run && run.order >= 0 ? `execução ${run.order + 1}` : "fora do grafo"}</span>
                {run?.refs.length ? <span>lê {run.refs.join(", ")}</span> : null}
                {run?.defines.length ? <span>define {run.defines.join(", ")}</span> : null}
                {cells.length > 1 ? (
                  <button type="button" aria-label="Remover célula" className="ml-auto grid size-11 place-items-center text-muted hover:text-danger" onClick={() => removeCell(cell.id)}>
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
              <textarea
                value={cell.code}
                aria-label={`Código da célula ${index + 1}`}
                onChange={(event) => updateCell(cell.id, event.target.value)}
                rows={Math.max(2, cell.code.split("\n").length)}
                spellCheck={false}
                className="w-full resize-none bg-transparent px-3 py-3 font-mono text-sm leading-relaxed text-ink outline-none"
              />
              <div className="border-t border-line px-3 py-3">
                {run?.error ? <p className="text-sm text-danger">{run.error}</p> : null}
                {run?.ok && run.display !== null && !chart ? (
                  <p className="font-serif text-2xl text-ink tabular-nums">{formatValue(run.display)}</p>
                ) : null}
                {chart ? (
                  <div className="h-40 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chart.data.map((value, point) => ({ i: String(point + 1), v: value }))}>
                        <XAxis dataKey="i" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis width={32} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          cursor={{ fill: "var(--copper-soft)" }}
                          contentStyle={{ background: "var(--paper-2)", border: "1px solid var(--line)", color: "var(--ink)" }}
                        />
                        <Bar dataKey="v" fill="var(--copper)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : null}
                {run?.bindings.length ? (
                  <ul className="mt-2 flex flex-col gap-1 font-mono text-xs text-muted">
                    {run.bindings.map((binding) => (
                      <li key={binding.name}>
                        {binding.name} = {formatValue(binding.value)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </article>
          );
        })}
        <button type="button" onClick={addCell} className="inline-flex h-11 items-center gap-2 self-start rounded-md border border-line px-4 text-sm">
          <Plus className="size-4" />
          Nova célula
        </button>
      </div>
    </div>
  );
}
