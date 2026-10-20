import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PlusNotice } from "@/components/blocks/plus-notice";
import { PricingTable } from "@/components/blocks/pricing-table";
import { PRICE_NOTE, readDevicePlusNotify, writeDevicePlusNotify } from "@/lib/plans";
import { useVault } from "@/lib/vault/store";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

function PricingPage() {
  const theme = useVault((state) => state.theme);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [notified, setNotified] = useState(false);

  useEffect(() => {
    try {
      void useVault.persist.rehydrate();
    } catch {
      /* theme stays on the default until the vault store is available */
    }
    setNotified(readDevicePlusNotify());
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Link to="/" className="font-serif text-xl text-ink">
          Locus
        </Link>
        <span className="text-sm text-muted">Planos</span>
        <Link to="/" className="ml-auto text-sm text-muted">
          Voltar ao cofre
        </Link>
      </header>
      <div className="mx-auto max-w-3xl px-4 pt-10 text-center">
        <h1 className="font-serif text-4xl text-ink">Planos</h1>
        <p className="mt-2 text-sm text-muted">
          O cofre de hoje cabe no Grátis. O Plus ainda não está à venda.
        </p>
      </div>
      <PricingTable onAskPlus={() => setNoticeOpen(true)} />
      <p className="px-4 pb-12 text-center text-sm text-muted">{PRICE_NOTE}</p>
      <PlusNotice
        open={noticeOpen}
        saved={notified}
        onClose={() => setNoticeOpen(false)}
        onSave={() => {
          writeDevicePlusNotify(true);
          setNotified(true);
        }}
        onForget={() => {
          writeDevicePlusNotify(false);
          setNotified(false);
        }}
      />
    </div>
  );
}
