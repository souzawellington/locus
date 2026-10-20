import { useState } from "react";
import { FigureHost } from "@/figures/FigureHost";
import { IdeaParseError, ideaSlug, parseIdeaFigure, type IdeaFigure } from "@/figures/idea/schema";
import { IdeaRequestError, PROVIDER_DEFAULTS, requestIdea, type IdeaProvider, type IdeaSettings } from "@/figures/idea/provider";
import { clearIdeaKey, hasIdeaKey, loadIdeaSettings, saveIdeaSettings } from "@/figures/idea/settings";
import { useVault } from "@/lib/vault/store";

type Step = "gate" | "settings" | "prompt" | "loading" | "preview" | "error";

function explain(error: unknown): string {
  if (error instanceof IdeaParseError) {
    if (error.issue === "unsafe") return "A resposta trazia conteúdo que não cabe numa figura. Nada foi guardado.";
    if (error.issue === "json") return "A resposta não veio em JSON. Tente de novo.";
    return "A resposta não descrevia uma máquina válida. Tente de novo.";
  }
  if (error instanceof IdeaRequestError) return error.message;
  return "Não consegui gerar a figura. Tente de novo.";
}

function SettingsForm({ onDone }: { onDone: () => void }) {
  const [draft, setDraft] = useState<IdeaSettings>(() => loadIdeaSettings());
  const locked = draft.provider !== "custom";

  function choose(provider: IdeaProvider) {
    if (provider === "custom") {
      setDraft((current) => ({ ...current, provider }));
      return;
    }
    setDraft((current) => ({
      ...current,
      provider,
      baseUrl: PROVIDER_DEFAULTS[provider].baseUrl,
      model: PROVIDER_DEFAULTS[provider].model,
    }));
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        saveIdeaSettings(draft);
        onDone();
      }}
    >
      <p className="text-sm leading-relaxed text-muted">
        A chave fica só neste navegador, em localStorage. O Locus não a envia para mais lado nenhum senão o fornecedor que você escolher, e só quando pede uma figura.
      </p>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Fornecedor
        <select
          className="h-11 rounded-md border border-line bg-paper px-3"
          value={draft.provider}
          onChange={(event) => choose(event.target.value as IdeaProvider)}
        >
          <option value="xai">xAI (Grok)</option>
          <option value="openai">OpenAI</option>
          <option value="custom">Outro, compatível com OpenAI</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Modelo
        <input className="h-11 rounded-md border border-line bg-paper px-3" value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Endereço
        <input
          className="h-11 rounded-md border border-line bg-paper px-3 disabled:text-muted"
          value={locked ? PROVIDER_DEFAULTS[draft.provider as "xai" | "openai"].baseUrl : draft.baseUrl}
          disabled={locked}
          onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Chave deste dispositivo
        <input
          type="password"
          autoComplete="off"
          className="h-11 rounded-md border border-line bg-paper px-3"
          value={draft.apiKey}
          onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="h-11 rounded-md bg-copper px-4 text-sm text-paper-2" disabled={!draft.apiKey.trim() || !draft.model.trim()}>
          Guardar neste dispositivo
        </button>
        <button
          type="button"
          className="h-11 rounded-md border border-line px-4 text-sm"
          onClick={() => {
            clearIdeaKey();
            setDraft(loadIdeaSettings());
          }}
        >
          Remover chave
        </button>
      </div>
    </form>
  );
}

export function MyIdeas() {
  const ideas = useVault((state) => state.ideas) ?? [];
  const renameIdea = useVault((state) => state.renameIdea);
  const deleteIdea = useVault((state) => state.deleteIdea);
  const [pending, setPending] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ slug: string; title: string; next: string } | null>(null);
  if (!ideas.length) return null;
  return (
    <section className="mb-4" aria-label="Minhas figuras">
      <h3 className="mb-2 font-serif text-xl text-ink">Minhas figuras</h3>
      <ul className="flex flex-col gap-2">
        {ideas.map((idea) => (
          <li key={idea.slug} className="rounded-md border border-line bg-paper-2 p-3">
            {edit?.slug === idea.slug ? (
              <form
                className="flex flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  renameIdea(idea.slug, edit.title, edit.next);
                  setEdit(null);
                }}
              >
                <input className="h-10 rounded-md border border-line bg-paper px-3 text-sm" value={edit.title} onChange={(event) => setEdit({ ...edit, title: event.target.value, next: event.target.value })} aria-label="Título" />
                <div className="flex gap-2">
                  <button type="submit" className="h-9 rounded-md bg-copper px-3 text-xs text-paper-2">Guardar nome</button>
                  <button type="button" className="h-9 rounded-md px-3 text-xs text-muted" onClick={() => setEdit(null)}>Cancelar</button>
                </div>
              </form>
            ) : (
              <>
                <p className="text-ink">{idea.title}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" className="h-9 rounded-md border border-line px-3 text-xs" onClick={() => setEdit({ slug: idea.slug, title: idea.title, next: idea.slug })}>
                    Renomear
                  </button>
                  <button type="button" className="h-9 rounded-md px-3 text-xs text-danger" onClick={() => setPending(idea.slug)}>
                    Excluir
                  </button>
                </div>
              </>
            )}
            {pending === idea.slug ? (
              <div className="mt-2 rounded-md border border-line bg-paper p-3 text-sm">
                <p>Excluir “{idea.title}”? As notas que a usam passam a dizer figura desconhecida.</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" className="h-9 rounded-md bg-danger px-3 text-xs text-paper-2" onClick={() => { deleteIdea(idea.slug); setPending(null); }}>
                    Excluir
                  </button>
                  <button type="button" className="h-9 rounded-md px-3 text-xs" onClick={() => setPending(null)}>Cancelar</button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProposeIdea({ open, onClose }: { open: boolean; onClose: () => void }) {
  const saveIdea = useVault((state) => state.saveIdea);
  const [step, setStep] = useState<Step>(() => (hasIdeaKey() ? "prompt" : "gate"));
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [previous, setPrevious] = useState<string | null>(null);
  const [figure, setFigure] = useState<IdeaFigure | null>(null);
  const [error, setError] = useState("");
  const [apart, setApart] = useState(false);

  if (!open) return null;

  async function generate() {
    setStep("loading");
    setError("");
    setApart(false);
    try {
      const content = await requestIdea(loadIdeaSettings(), { description, previous, note });
      const next = parseIdeaFigure(content);
      setFigure(next);
      setPrevious(JSON.stringify(next));
      setStep("preview");
    } catch (caught) {
      setError(explain(caught));
      setStep("error");
    }
  }

  function discard() {
    setFigure(null);
    setPrevious(null);
    setNote("");
    setError("");
    setApart(false);
    setStep(hasIdeaKey() ? "prompt" : "gate");
    onClose();
  }

  const previewSlug = figure ? ideaSlug(figure.name, []) : "ideia-previa";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="idea-title">
      <button type="button" aria-label="Fechar proposta" className="absolute inset-0 bg-ink/40" onClick={discard} />
      <div className="relative z-10 m-4 flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-line bg-paper text-ink">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h2 id="idea-title" className="font-serif text-2xl">Proponha uma ideia</h2>
          <button type="button" className="ml-auto h-9 rounded-md px-3 text-sm text-muted" onClick={() => setStep("settings")}>Chave</button>
          <button type="button" className="h-9 rounded-md px-3 text-sm text-muted" onClick={discard}>Fechar</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {step === "gate" ? (
            <div className="flex max-w-lg flex-col gap-3">
              <p className="text-sm leading-relaxed text-muted">
                Descreva uma máquina e o modelo desenha uma figura no mesmo formato das outras. Sem a sua chave, nada é pedido à rede. O resto das notas continua igual.
              </p>
              <button type="button" className="h-11 self-start rounded-md bg-copper px-4 text-sm text-paper-2" onClick={() => setStep("settings")}>
                Adicionar chave
              </button>
            </div>
          ) : null}
          {step === "settings" ? <SettingsForm onDone={() => setStep(hasIdeaKey() ? "prompt" : "gate")} /> : null}
          {step === "prompt" || step === "error" ? (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm" htmlFor="idea-prompt">
                A máquina, em palavras
                <textarea id="idea-prompt" value={description} onChange={(event) => setDescription(event.target.value)} rows={5} className="rounded-md border border-line bg-paper-2 px-3 py-2 text-base" placeholder="Uma prensa que só desce depois de uma alavanca." />
              </label>
              {previous ? (
                <label className="flex flex-col gap-1 text-sm" htmlFor="idea-note">
                  Ajuste, se quiser
                  <textarea id="idea-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="rounded-md border border-line bg-paper-2 px-3 py-2" placeholder="Afaste mais o vaso de cima." />
                </label>
              ) : null}
              {step === "error" ? <p className="text-sm text-danger">{error}</p> : null}
              <button type="button" className="h-11 self-start rounded-md bg-copper px-4 text-sm text-paper-2" disabled={description.trim().length < 8} onClick={() => void generate()}>
                {previous ? "Gerar de novo" : "Gerar"}
              </button>
            </div>
          ) : null}
          {step === "loading" ? <p className="text-sm text-muted">A desenhar a máquina…</p> : null}
          {step === "preview" && figure ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" aria-pressed={apart} className="h-10 rounded-full border border-line px-3 text-sm" onClick={() => setApart((value) => !value)}>
                  {apart ? "Montada" : "Desmontar"}
                </button>
              </div>
              <FigureHost embed={{ slug: previewSlug, size: "full", motion: "animated", tilt: 0 }} apart={apart} showExport={false} draft={{ ...figure, slug: previewSlug }} />
              <FigureHost embed={{ slug: previewSlug, size: "sticker", motion: "animated", tilt: -2 }} apart={false} showExport={false} draft={{ ...figure, slug: previewSlug }} />
              <p className="text-sm text-muted">A figurinha acima repete o mesmo mecanismo. Salvar grava a figura e a nota aberta.</p>
            </div>
          ) : null}
        </div>
        {step === "preview" && figure ? (
          <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
            <button
              type="button"
              className="h-11 rounded-md bg-copper px-4 text-sm text-paper-2"
              onClick={() => {
                saveIdea(figure);
                discard();
              }}
            >
              Salvar
            </button>
            <button type="button" className="h-11 rounded-md border border-line px-4 text-sm" onClick={() => setStep("prompt")}>
              Gerar de novo
            </button>
            <button type="button" className="h-11 rounded-md px-4 text-sm text-muted" onClick={discard}>
              Descartar
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
