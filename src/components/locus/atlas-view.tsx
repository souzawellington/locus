import { useEffect, useRef, useState } from "react";
import { TOOLS } from "@/lib/vault/agent";
import { weaveSource } from "@/lib/vault/weave";
import { PATTERNS, renderCapture, SAMPLE_SOURCE } from "@/lib/vault/patterns";
import { useVault } from "@/lib/vault/store";
import { cn } from "@/lib/utils";

const startedJobs = new Set<string>();

const prompts = [
  "O que registrei sobre CRDT e sincronização local?",
  "Como o caderno evita estado oculto?",
  "Quais riscos um servidor MCP de arquivos tem?",
  "Cria uma nota sobre revisão semanal",
  "Calcula mean(amostra)",
];

export function AtlasView() {
  const messages = useVault((state) => state.messages);
  const ask = useVault((state) => state.ask);
  const approve = useVault((state) => state.approve);
  const refuse = useVault((state) => state.refuse);
  const select = useVault((state) => state.select);
  const preparePattern = useVault((state) => state.preparePattern);
  const pendingPrompt = useVault((state) => state.pendingPrompt);
  const fabricJob = useVault((state) => state.fabricJob);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const busy = Boolean(fabricJob);
  const lastMessage = messages[messages.length - 1]?.content;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastMessage]);

  useEffect(() => {
    if (!pendingPrompt) return;
    setDraft(pendingPrompt);
    useVault.setState({ pendingPrompt: "" });
    window.setTimeout(() => document.getElementById("atlas-ask")?.focus(), 0);
  }, [pendingPrompt]);

  useEffect(() => {
    const job = useVault.getState().fabricJob;
    if (!job || startedJobs.has(job.assistantId)) return;
    startedJobs.add(job.assistantId);
    useVault.setState({ fabricJob: { ...job, started: true } });
    const pattern = job.patternId;
    void weaveSource({ data: { patternId: job.patternId, source: job.source } })
      .then((result) => {
        if (!result.ok) {
          useVault.getState().resolveFabric(job.assistantId, { error: result.error });
          return;
        }
        const state = useVault.getState();
        const rendered = renderCapture(result.capture, state.notes, state.cells);
        useVault.getState().resolveFabric(job.assistantId, { content: rendered.preview, draft: rendered.draft, pattern });
      })
      .catch(() => {
        useVault.getState().resolveFabric(job.assistantId, { error: "Não consegui chegar à fonte. Nada foi gravado." });
      });
  }, [fabricJob?.assistantId]);

  function submit(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    ask(value);
    setDraft("");
  }

  return (
    <div className="grid h-full min-h-0 md:grid-cols-[16rem_1fr]">
      <aside className="hidden min-h-0 flex-col gap-5 overflow-y-auto border-r border-line p-4 md:flex">
        <div>
          <p className="text-xs tracking-wide text-muted uppercase">Biblioteca dos Profissionais</p>
          <ul className="mt-3 flex flex-col gap-2">
            {PATTERNS.map((pattern) => (
              <li key={pattern.id}>
                <button type="button" onClick={() => preparePattern(pattern.id)} className="w-full rounded-md px-2 py-2 text-left hover:bg-paper">
                  <span className="font-mono text-xs text-copper">{pattern.id}</span>
                  <span className="mt-1 block text-sm text-ink">{pattern.label}</span>
                  <span className="block text-xs leading-snug text-muted">{pattern.blurb}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs tracking-wide text-muted uppercase">Ferramentas</p>
          <ul className="mt-3 flex flex-col gap-3">
            {TOOLS.map((tool) => (
              <li key={tool.name}>
                <p className="font-mono text-xs text-ink">{tool.name}</p>
                <p className="text-xs text-muted">{tool.readOnly ? "só leitura" : "escrita · pede aprovação"}</p>
                <p className="mt-1 text-sm leading-snug text-ink">{tool.summary}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          A biblioteca manda só a fonte que você cola. As notas ficam aqui. O CVE-2025-53109 mostrou um servidor MCP de arquivos escapando da pasta por link simbólico. Este host não grava fora do cofre sem um sim.
        </p>
      </aside>
      <div className="flex min-h-0 flex-col">
        <div className="border-b border-line px-5 py-4">
          <h1 className="font-serif text-3xl text-ink">Atlas</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            O cofre responde no dispositivo. A Biblioteca dos Profissionais aplica um padrão à fonte colada e só grava depois de Aprovar.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {messages.length === 0 ? (
            <div className="mx-auto max-w-3xl">
              <p className="max-w-xl text-muted">
                Pergunte ao cofre, ou chame um padrão: extract_wisdom, summarize, map_concepts. A resposta da biblioteca é uma pré-visualização com [[ligações]], não uma gravação.
              </p>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
              {messages.map((message) => (
                <article key={message.id} className={cn("flex flex-col gap-2", message.role === "user" ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "max-w-full rounded-lg px-4 py-3 whitespace-pre-wrap",
                      message.role === "user" ? "bg-ink text-paper-2" : "border border-line bg-paper-2 text-ink",
                    )}
                  >
                    {message.content}
                  </div>
                  {message.trace ? (
                    <div className="w-full rounded-md border border-line bg-paper px-3 py-2 font-mono text-xs text-muted">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-ink">{message.trace.name}</span>
                        <span>{message.trace.readOnly ? "só leitura" : "escrita"}</span>
                        <span>
                          {message.trace.status === "pending" ? "aguardando" : message.trace.status === "done" ? "executada" : "recusada"}
                        </span>
                      </div>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(message.trace.args, null, 2)}</pre>
                      {message.trace.result ? <p className="mt-2 text-ink">{message.trace.result}</p> : null}
                      {message.trace.status === "pending" ? (
                        <div className="mt-3 flex gap-2">
                          <button type="button" className="h-11 rounded-md bg-copper px-4 font-sans text-sm text-paper-2" onClick={() => approve(message.id)}>
                            Aprovar
                          </button>
                          <button type="button" className="h-11 rounded-md border border-line px-4 font-sans text-sm text-ink" onClick={() => refuse(message.id)}>
                            Recusar
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {message.citations?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {message.citations.map((citation) => (
                        <button
                          key={`${message.id}-${citation.noteId}-${citation.excerpt.slice(0, 12)}`}
                          type="button"
                          className="max-w-full rounded-md border border-line px-3 py-2 text-left text-sm"
                          onClick={() => select(citation.noteId)}
                        >
                          <span className="block font-medium text-copper">{citation.title}</span>
                          <span className="line-clamp-2 text-muted">{citation.excerpt}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>
        <form
          className="border-t border-line p-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
        >
          <div className="mx-auto mb-2 flex w-full max-w-3xl gap-2 overflow-x-auto">
            {PATTERNS.map((pattern) => (
              <button
                key={pattern.id}
                type="button"
                className="h-11 shrink-0 rounded-full border border-line px-3 font-mono text-xs"
                onClick={() => {
                  setDraft(`${pattern.id}\n`);
                  document.getElementById("atlas-ask")?.focus();
                }}
              >
                {pattern.id}
              </button>
            ))}
            <button type="button" className="h-11 shrink-0 rounded-full border border-line px-3 text-sm" onClick={() => setDraft(SAMPLE_SOURCE)}>
              Exemplo extract_wisdom
            </button>
          </div>
          <div className="mx-auto mb-2 flex w-full max-w-3xl gap-2 overflow-x-auto">
            {prompts.map((prompt) => (
              <button key={prompt} type="button" className="h-11 shrink-0 rounded-full border border-line px-3 text-sm" onClick={() => submit(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
          <div className="mx-auto flex w-full max-w-3xl gap-2">
            <label htmlFor="atlas-ask" className="sr-only">
              Pergunta ao cofre ou padrão da biblioteca
            </label>
            <textarea
              id="atlas-ask"
              value={draft}
              rows={draft.includes("\n") ? 6 : 2}
              placeholder="Pergunte ao cofre, ou extract_wisdom e a fonte. Enter envia."
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit(draft);
                }
              }}
              className="min-h-11 flex-1 resize-none rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-muted"
            />
            <button type="submit" disabled={busy} className="h-11 self-end rounded-md bg-copper px-4 text-sm text-paper-2 disabled:opacity-50">
              {busy ? "Lendo" : "Enviar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
