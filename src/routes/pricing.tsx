import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  PricingTable,
  type PlanLevel,
  type PricingFeature,
  type PricingPlan,
} from "@/components/blocks/pricing-table";
import { useVault } from "@/lib/vault/store";

const features: PricingFeature[] = [
  { name: "Análises básicas", included: "starter" },
  { name: "Até 5 pessoas", included: "starter" },
  { name: "Suporte básico", included: "starter" },
  { name: "Análises avançadas", included: "pro" },
  { name: "Até 20 pessoas", included: "pro" },
  { name: "Suporte prioritário", included: "pro" },
  { name: "Integrações próprias", included: "all" },
  { name: "Pessoas sem limite", included: "all" },
  { name: "Suporte 24 horas", included: "all" },
];

const plans: PricingPlan[] = [
  { name: "Inicial", level: "starter", price: { monthly: 15, yearly: 144 } },
  { name: "Pro", level: "pro", price: { monthly: 49, yearly: 470 }, popular: true },
  { name: "Empresa", level: "all", price: { monthly: 99, yearly: 990 } },
];

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

function PricingPage() {
  const theme = useVault((state) => state.theme);
  const [selected, setSelected] = useState<PlanLevel>("pro");

  useEffect(() => {
    try {
      void useVault.persist.rehydrate();
    } catch {
      /* theme stays on the default until the vault store is available */
    }
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
      <PricingTable
        features={features}
        plans={plans}
        defaultPlan="pro"
        defaultInterval="monthly"
        onPlanSelect={setSelected}
        containerClassName="py-12"
        buttonClassName="bg-copper text-paper-2"
      />
      <p className="px-4 pb-12 text-center text-sm text-muted">
        Plano em vista: {planLabel(selected)}. A escolha fica nesta tela. O texto do cofre não sai
        do aparelho.
      </p>
    </div>
  );
}

function planLabel(level: PlanLevel) {
  return plans.find((plan) => plan.level === level)?.name ?? level;
}
