export function ApproveLine({
  sentence,
  onYes,
  onNo,
  yesLabel = "Aprovar",
  noLabel = "Recusar",
}: {
  sentence: string;
  onYes: () => void;
  onNo: () => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-ink/40 p-4"
      role="dialog"
      aria-label="Confirmar"
    >
      <div className="w-full max-w-sm rounded-lg border border-line bg-paper p-4">
        <p className="text-ink">{sentence}</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="h-11 rounded-md bg-copper px-4 text-sm text-paper-2"
            onClick={onYes}
          >
            {yesLabel}
          </button>
          <button
            type="button"
            className="h-11 rounded-md border border-line px-4 text-sm text-ink"
            onClick={onNo}
          >
            {noLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
