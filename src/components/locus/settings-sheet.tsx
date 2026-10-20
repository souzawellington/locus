import { useEffect, useState } from "react";
import { readOrsKey, writeOrsKey } from "@/lib/maps/route";
import { useVault } from "@/lib/vault/store";

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sourceChosen = useVault((state) => state.sourceChosen);
  const setSourceChosen = useVault((state) => state.setSourceChosen);
  const hasDevicePin = useVault((state) => state.hasDevicePin);
  const setDevicePin = useVault((state) => state.setDevicePin);
  const clearDevicePin = useVault((state) => state.clearDevicePin);
  const placeSuggest = useVault((state) => state.placeSuggest);
  const setPlaceSuggest = useVault((state) => state.setPlaceSuggest);
  const placeAlerts = useVault((state) => state.placeAlerts);
  const setPlaceAlerts = useVault((state) => state.setPlaceAlerts);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [ors, setOrs] = useState("");

  useEffect(() => {
    if (open) setOrs(readOrsKey());
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 md:items-center" role="dialog" aria-label="Ajustes">
      <div className="max-h-[85dvh] w-full max-w-md overflow-auto rounded-t-2xl border border-line bg-paper p-5 md:rounded-lg">
        <h2 className="font-serif text-2xl text-ink">Ajustes</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          As notas ficam neste aparelho. Ler não pede nada. Escrever, exportar ou pedir a um modelo que escreva espera Aprovar. Uma nota trancada fica fora da busca, do grafo, do Atlas, da exportação e do mapa até você abrir.
        </p>
        <label className="mt-5 flex min-h-11 items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-5"
            checked={sourceChosen}
            onChange={(event) => setSourceChosen(event.target.checked)}
          />
          <span>
            <span className="block text-ink">Ver código</span>
            <span className="block text-muted">O editor visual é o padrão. O código fica aqui, para quem já trabalha com o arquivo.</span>
          </span>
        </label>
        <label className="mt-5 flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 size-5" checked={placeSuggest} onChange={(event) => setPlaceSuggest(event.target.checked)} />
          <span>
            <span className="block text-ink">Sugerir mapa</span>
            <span className="block text-muted">Quando uma linha parecer um endereço, um botão oferece o mapa. Nada é buscado antes do toque.</span>
          </span>
        </label>
        <label className="mt-5 flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 size-5" checked={placeAlerts} onChange={(event) => setPlaceAlerts(event.target.checked)} />
          <span>
            <span className="block text-ink">Alertas</span>
            <span className="block text-muted">Tempo, terremotos e eventos perto de um lugar salvo. A busca só acontece com a nota aberta, e a coordenada vai arredondada.</span>
          </span>
        </label>
        <h3 className="mt-6 font-serif text-xl text-ink">Rotas</h3>
        <p className="mt-1 text-sm text-muted">
          Sem chave, o caminho usa o servidor público de demonstração, só quando você pede. Uma chave do OpenRouteService, se você tiver, fica neste aparelho e só sai na hora de traçar a rota.
        </p>
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            writeOrsKey(ors);
            setMessage(ors.trim() ? "Chave de rota guardada neste aparelho." : "Chave de rota removida.");
          }}
        >
          <input
            type="password"
            autoComplete="off"
            aria-label="Chave do OpenRouteService"
            value={ors}
            onChange={(event) => setOrs(event.target.value)}
            placeholder="Chave opcional"
            className="h-11 rounded-md border border-line bg-paper-2 px-3 text-base outline-none"
          />
          <button type="submit" className="h-11 rounded-md border border-line text-sm">
            Guardar chave
          </button>
        </form>
        <h3 className="mt-6 font-serif text-xl text-ink">PIN do aparelho</h3>
        <p className="mt-1 text-sm text-muted">
          Opcional. Serve no lugar da senha ao trancar uma nota. Fica só neste aparelho. Senha ou PIN esquecidos não recuperam a nota.
        </p>
        {hasDevicePin ? (
          <button type="button" className="mt-3 h-11 rounded-md border border-line px-4 text-sm" onClick={() => clearDevicePin()}>
            Remover PIN
          </button>
        ) : (
          <form
            className="mt-3 flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const next = pin.trim();
              if (next.length < 4) {
                setMessage("Use pelo menos 4 dígitos.");
                return;
              }
              void setDevicePin(next).then(() => {
                setPin("");
                setMessage("PIN definido neste aparelho.");
              });
            }}
          >
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              aria-label="PIN do aparelho"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="Pelo menos 4 dígitos"
              className="h-11 rounded-md border border-line bg-paper-2 px-3 text-base outline-none"
            />
            <button type="submit" className="h-11 rounded-md bg-copper text-sm text-paper-2">
              Definir PIN
            </button>
          </form>
        )}
        {message ? <p className="mt-2 text-sm text-muted">{message}</p> : null}
        <button type="button" className="mt-6 h-11 rounded-md border border-line px-4 text-sm" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}
