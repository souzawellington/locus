import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import NumberFlow from "@number-flow/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  featureGroups,
  features as planFeatures,
  FREE_ACTION,
  planIncludes,
  plans as planOffers,
  PLUS_ACTION,
  priceLabel,
  shownCents,
  yearlyDiscountPercent,
  type BillingInterval,
  type PlanId,
} from "@/lib/plans";

const money = {
  style: "currency" as const,
  currency: "BRL",
};

export function PricingTable({ onAskPlus }: { onAskPlus: () => void }) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [selected, setSelected] = useState<PlanId>("plus");
  const plus = planOffers.find((plan) => plan.id === "plus");
  const discount = plus ? yearlyDiscountPercent(plus) : 0;

  return (
    <section className="bg-paper px-4 py-10 text-ink sm:py-16">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 flex justify-center">
          <div
            className="inline-flex items-center gap-1 rounded-full border border-line bg-paper-2 p-1 text-sm"
            role="group"
            aria-label="Período de cobrança"
          >
            <button
              type="button"
              aria-pressed={interval === "monthly"}
              onClick={() => setInterval("monthly")}
              className={cn(
                "rounded-full px-4 py-2",
                interval === "monthly" ? "bg-copper-soft text-ink" : "text-muted",
              )}
            >
              Mensal
            </button>
            <button
              type="button"
              aria-pressed={interval === "yearly"}
              onClick={() => setInterval("yearly")}
              className={cn(
                "rounded-full px-4 py-2",
                interval === "yearly" ? "bg-copper-soft text-ink" : "text-muted",
              )}
            >
              Anual
              {discount > 0 ? <span className="ml-2 text-copper">−{discount}%</span> : null}
            </button>
          </div>
        </div>

        <div className="mb-10 grid gap-4 sm:grid-cols-2">
          {planOffers.map((plan) => {
            const cents = shownCents(plan, interval);
            return (
              <article
                key={plan.id}
                className={cn(
                  "flex flex-col rounded-xl border border-line bg-paper-2 p-5",
                  selected === plan.id && "ring-2 ring-copper",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-serif text-2xl">{plan.name}</h2>
                  {plan.id === "plus" ? (
                    <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                      Em breve
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 min-h-10 text-sm text-muted">{plan.summary}</p>
                <div className="mt-4 flex items-baseline gap-2">
                  <NumberFlow
                    locales="pt-BR"
                    format={{ ...money, minimumFractionDigits: 2, maximumFractionDigits: 2 }}
                    value={cents / 100}
                    className="text-4xl font-medium text-ink"
                  />
                  <span className="text-sm text-muted">
                    {plan.id === "free" ? "para sempre" : interval === "yearly" ? "/ano" : "/mês"}
                  </span>
                </div>
                <p className="mt-2 min-h-10 text-sm text-muted">{priceLabel(plan, interval)}</p>
                <div className="mt-auto pt-4">
                  {plan.id === "free" ? (
                    <Link
                      to="/"
                      onClick={() => setSelected("free")}
                      className="flex h-11 items-center justify-center rounded-md border border-line px-4 text-sm text-ink"
                    >
                      {FREE_ACTION}
                    </Link>
                  ) : (
                    <Button
                      onClick={() => {
                        setSelected("plus");
                        onAskPlus();
                      }}
                      className="h-11 w-full rounded-md"
                    >
                      {PLUS_ACTION}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div className="overflow-hidden rounded-xl border border-line">
          <div className="grid grid-cols-[1fr_4.75rem_4.75rem] items-center bg-paper-2 px-4 py-3 text-sm sm:grid-cols-[1fr_6rem_6rem]">
            <div className="font-medium">Recursos</div>
            {planOffers.map((plan) => (
              <div key={plan.id} className="text-center font-medium">
                {plan.name}
              </div>
            ))}
          </div>
          {featureGroups.map((group) => (
            <div key={group.id}>
              <div className="border-t border-line px-4 py-2 font-serif text-sm text-ink">
                {group.label}
              </div>
              {planFeatures
                .filter((feature) => feature.group === group.id)
                .map((feature) => (
                  <div
                    key={feature.id}
                    className="grid grid-cols-[1fr_4.75rem_4.75rem] items-center border-t border-line px-4 py-3 text-sm sm:grid-cols-[1fr_6rem_6rem]"
                  >
                    <div>
                      {feature.name}
                      {feature.comingSoon ? (
                        <span className="ml-2 inline-flex rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                          Em breve
                        </span>
                      ) : null}
                    </div>
                    {planOffers.map((plan) => (
                      <div key={plan.id} className="flex justify-center">
                        {planIncludes(feature.included, plan.id) ? (
                          <Check className="size-4 text-copper" aria-label="Incluído" />
                        ) : (
                          <span className="text-muted" aria-label="Não incluído">
                            —
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
