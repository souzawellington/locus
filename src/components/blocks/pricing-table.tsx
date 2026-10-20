import { ArrowRightIcon, CheckIcon } from "@radix-ui/react-icons";
import NumberFlow from "@number-flow/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PlanLevel = "starter" | "pro" | "all" | string;

export interface PricingFeature {
  name: string;
  included: PlanLevel | null;
}

export interface PricingPlan {
  name: string;
  level: PlanLevel;
  price: {
    monthly: number;
    yearly: number;
  };
  popular?: boolean;
}

export interface PricingTableProps {
  features: PricingFeature[];
  plans: PricingPlan[];
  onPlanSelect?: (plan: PlanLevel) => void;
  defaultPlan?: PlanLevel;
  defaultInterval?: "monthly" | "yearly";
  className?: string;
  containerClassName?: string;
  buttonClassName?: string;
}

export function PricingTable({
  features,
  plans,
  onPlanSelect,
  defaultPlan = "pro",
  defaultInterval = "monthly",
  className,
  containerClassName,
  buttonClassName,
}: PricingTableProps) {
  const [isYearly, setIsYearly] = useState(defaultInterval === "yearly");
  const [selectedPlan, setSelectedPlan] = useState<PlanLevel>(defaultPlan);

  const handlePlanSelect = (plan: PlanLevel) => {
    setSelectedPlan(plan);
    onPlanSelect?.(plan);
  };

  return (
    <section className={cn("bg-paper px-4 py-12 text-ink sm:py-24 md:py-32", className)}>
      <div className={cn("mx-auto w-full max-w-3xl px-4", containerClassName)}>
        <div className="mb-4 flex justify-end sm:mb-8">
          <div
            className="inline-flex items-center gap-2 text-xs sm:text-sm"
            role="group"
            aria-label="Período de cobrança"
          >
            <button
              type="button"
              aria-pressed={!isYearly}
              onClick={() => setIsYearly(false)}
              className={cn(
                "rounded-md px-3 py-1 transition-colors",
                !isYearly ? "bg-copper-soft text-ink" : "text-muted",
              )}
            >
              Mensal
            </button>
            <button
              type="button"
              aria-pressed={isYearly}
              onClick={() => setIsYearly(true)}
              className={cn(
                "rounded-md px-3 py-1 transition-colors",
                isYearly ? "bg-copper-soft text-ink" : "text-muted",
              )}
            >
              Anual
            </button>
          </div>
        </div>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row">
          {plans.map((plan) => (
            <button
              key={plan.name}
              type="button"
              aria-pressed={selectedPlan === plan.level}
              onClick={() => handlePlanSelect(plan.level)}
              className={cn(
                "flex-1 rounded-xl border border-line bg-paper-2 p-4 text-left transition-all",
                selectedPlan === plan.level && "ring-2 ring-copper",
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">{plan.name}</span>
                {plan.popular ? (
                  <span className="rounded-full bg-copper-soft px-2 py-0.5 text-xs text-copper">
                    Em destaque
                  </span>
                ) : null}
              </div>
              <div className="flex items-baseline gap-1">
                <NumberFlow
                  format={{
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  }}
                  value={isYearly ? plan.price.yearly : plan.price.monthly}
                  className="text-2xl font-bold text-ink"
                />
                <span className="text-sm font-normal text-muted">/{isYearly ? "ano" : "mês"}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-line">
          <div className="overflow-x-auto">
            <div className="min-w-[640px] divide-y divide-line">
              <div className="flex items-center bg-paper-2 p-4">
                <div className="flex-1 text-sm font-medium">Recursos</div>
                <div className="flex items-center gap-8 text-sm">
                  {plans.map((plan) => (
                    <div key={plan.level} className="w-16 text-center font-medium">
                      {plan.name}
                    </div>
                  ))}
                </div>
              </div>
              {features.map((feature) => (
                <div
                  key={feature.name}
                  className={cn(
                    "flex items-center p-4 transition-colors",
                    feature.included === selectedPlan && "bg-copper-soft",
                  )}
                >
                  <div className="flex-1 text-sm">{feature.name}</div>
                  <div className="flex items-center gap-8 text-sm">
                    {plans.map((plan) => (
                      <div
                        key={plan.level}
                        className={cn(
                          "flex w-16 justify-center",
                          plan.level === selectedPlan && "font-medium",
                        )}
                      >
                        {shouldShowCheck(feature.included, plan.level) ? (
                          <CheckIcon className="h-5 w-5 text-copper" aria-label="Incluído" />
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Button
            className={cn(
              "w-full rounded-xl bg-copper px-8 py-2 text-paper-2 hover:bg-copper/90 sm:w-auto",
              buttonClassName,
            )}
          >
            Começar com {plans.find((plan) => plan.level === selectedPlan)?.name}
            <ArrowRightIcon className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}

function shouldShowCheck(included: PricingFeature["included"], level: string): boolean {
  if (included === "all") return true;
  if (included === "pro" && (level === "pro" || level === "all")) return true;
  if (included === "starter" && (level === "starter" || level === "pro" || level === "all"))
    return true;
  return false;
}
