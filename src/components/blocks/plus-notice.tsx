import { useEffect, useRef } from "react";
import { PLUS_ACTION } from "@/lib/plans";

export function PlusNotice({
  open,
  saved,
  onClose,
  onSave,
  onForget,
}: {
  open: boolean;
  saved: boolean;
  onClose: () => void;
  onSave: () => void;
  onForget: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plus-notice-title"
    >
      <button
        type="button"
        aria-label="Fechar aviso"
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
      />
      <div className="relative m-4 w-full max-w-md rounded-lg border border-line bg-paper-2 p-5">
        <h2 id="plus-notice-title" className="pr-8 font-serif text-2xl text-ink">
          O Plus ainda não lançou
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Conta, sincronização, cópia na nuvem, IA sem chave, notas compartilhadas, conversa e mídia
          mais longa ainda não existem. Nada disso está à venda. Se quiser, este aparelho guarda um
          aviso para o lançamento. Sem e-mail. Nada é enviado.
        </p>
        {saved ? <p className="mt-3 text-sm text-ink">Aviso guardado neste aparelho.</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {saved ? (
            <button
              type="button"
              className="h-11 rounded-md border border-line px-4 text-sm"
              onClick={onForget}
            >
              Apagar aviso
            </button>
          ) : (
            <button
              type="button"
              className="h-11 rounded-md bg-copper px-4 text-sm text-paper-2"
              onClick={onSave}
            >
              {PLUS_ACTION}
            </button>
          )}
          <button
            ref={closeRef}
            type="button"
            className="h-11 rounded-md border border-line px-4 text-sm"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
