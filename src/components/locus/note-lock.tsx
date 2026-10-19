import { Lock } from "lucide-react";
import { useState } from "react";
import { currentDevicePin, pinMatches, readPinRecord, rememberDevicePin } from "@/lib/vault/seal";
import { useVault } from "@/lib/vault/store";

export function LockScreen({ noteId }: { noteId: string }) {
  const unlockNote = useVault((state) => state.unlockNote);
  const hasDevicePin = useVault((state) => state.hasDevicePin);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function openWith(value: string) {
    const secret = value.trim();
    if (!secret || busy) return;
    setBusy(true);
    setError("");
    const ok = await unlockNote(noteId, secret);
    setBusy(false);
    if (!ok) setError("Senha incorreta.");
    else setPassword("");
  }

  async function unlockWithDevicePin() {
    const remembered = currentDevicePin();
    if (remembered) {
      const ok = await unlockNote(noteId, remembered);
      if (!ok) setError("O PIN do aparelho não abre esta nota.");
      return;
    }
    const typed = password.trim();
    const record = readPinRecord();
    if (!typed || !record) {
      setError("Digite o PIN do aparelho e toque em Usar PIN.");
      return;
    }
    if (!(await pinMatches(record, typed))) {
      setError("PIN incorreto.");
      return;
    }
    rememberDevicePin(typed);
    const ok = await unlockNote(noteId, typed);
    if (!ok) setError("O PIN do aparelho não abre esta nota. Ela foi trancada com outra senha.");
  }

  return (
    <form
      data-testid="lock-screen"
      className="flex flex-col gap-4 rounded-lg border border-line bg-paper-2 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void openWith(password);
      }}
    >
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-copper-soft text-copper">
          <Lock className="size-5" />
        </span>
        <div>
          <p className="font-serif text-2xl text-ink">Nota trancada</p>
          <p className="text-sm text-muted">Abra com a senha. A abertura vale só nesta sessão.</p>
        </div>
      </div>
      <label className="flex flex-col gap-1 text-sm text-muted">
        Senha
        <input
          type="password"
          value={password}
          autoComplete="current-password"
          aria-label="Senha da nota"
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 rounded-md border border-line bg-paper px-3 text-base text-ink outline-none"
        />
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="h-11 rounded-md bg-copper px-4 text-sm text-paper-2" disabled={busy}>
          Abrir
        </button>
        {hasDevicePin ? (
          <button type="button" className="h-11 rounded-md border border-line px-4 text-sm" onClick={() => void unlockWithDevicePin()}>
            Usar PIN do aparelho
          </button>
        ) : null}
      </div>
      <p className="text-sm text-muted">Se a senha foi esquecida, esta nota não pode ser recuperada.</p>
    </form>
  );
}

export function LockDialog({ noteId, onClose }: { noteId: string; onClose: () => void }) {
  const lockNote = useVault((state) => state.lockNote);
  const hasDevicePin = useVault((state) => state.hasDevicePin);
  const [password, setPassword] = useState("");
  const [hideTitle, setHideTitle] = useState(false);
  const [useDevicePin, setUseDevicePin] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError("");
    let secret = password.trim();
    if (useDevicePin) {
      const remembered = currentDevicePin();
      if (remembered) secret = remembered;
      else {
        const record = readPinRecord();
        if (!secret || !record || !(await pinMatches(record, secret))) {
          setError("Digite o PIN do aparelho para trancar com ele.");
          return;
        }
        rememberDevicePin(secret);
      }
    }
    if (secret.length < 4) {
      setError("Use pelo menos 4 caracteres.");
      return;
    }
    setBusy(true);
    await lockNote(noteId, secret, hideTitle);
    setBusy(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 md:items-center md:p-4" role="dialog" aria-label="Trancar nota">
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-t-2xl border border-line bg-paper p-5 md:rounded-lg"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p className="font-serif text-2xl text-ink">Trancar nota</p>
        <p className="text-sm text-muted">A nota fica cifrada neste aparelho. Uma senha esquecida não recupera o texto. Não há como redefinir.</p>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {useDevicePin ? "PIN do aparelho" : "Senha"}
          <input
            type="password"
            value={password}
            autoFocus
            aria-label="Senha para trancar"
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 rounded-md border border-line bg-paper-2 px-3 text-base text-ink outline-none"
          />
        </label>
        {hasDevicePin ? (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={useDevicePin} onChange={(event) => setUseDevicePin(event.target.checked)} />
            Trancar com o PIN do aparelho
          </label>
        ) : null}
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={hideTitle} onChange={(event) => setHideTitle(event.target.checked)} />
          Ocultar o título na lista
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <button type="submit" className="h-11 flex-1 rounded-md bg-copper text-sm text-paper-2" disabled={busy}>
            Trancar
          </button>
          <button type="button" className="h-11 rounded-md border border-line px-4 text-sm" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
