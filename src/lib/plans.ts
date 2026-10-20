export type PlanId = "free" | "plus";

export type FeatureGroupId = "notes" | "media" | "maps" | "ai" | "account";

export type BillingInterval = "monthly" | "yearly";

export type PlanOffer = {
  id: PlanId;
  name: string;
  /** Price in cents. Zero is the free plan. */
  monthlyCents: number;
  yearlyCents: number;
  summary: string;
};

export type PlanFeature = {
  id: string;
  name: string;
  group: FeatureGroupId;
  /** Lowest plan that includes this row. Plus includes every free row. */
  included: PlanId;
  comingSoon: boolean;
};

export type FeatureGroup = {
  id: FeatureGroupId;
  label: string;
};

type FlagStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export const PLUS_NOTIFY_KEY = "locus-plus-notify";

export const FREE_ACTION = "Você já está no Grátis";
export const PLUS_ACTION = "Avisar quando lançar";
export const PRICE_NOTE =
  "Os preços do Plus podem mudar até o lançamento. Nenhuma cobrança é feita hoje.";

const rank: Record<PlanId, number> = { free: 0, plus: 1 };

export const plans: readonly PlanOffer[] = [
  {
    id: "free",
    name: "Grátis",
    monthlyCents: 0,
    yearlyCents: 0,
    summary: "Tudo o que o Locus faz hoje, neste aparelho.",
  },
  {
    id: "plus",
    name: "Plus",
    monthlyCents: 1490,
    yearlyCents: 11900,
    summary: "O que vem depois. Ainda não dá para comprar.",
  },
];

export const featureGroups: readonly FeatureGroup[] = [
  { id: "notes", label: "Notas" },
  { id: "media", label: "Mídia" },
  { id: "maps", label: "Mapas" },
  { id: "ai", label: "IA" },
  { id: "account", label: "Conta e sincronização" },
];

export const features: readonly PlanFeature[] = [
  {
    id: "notes-local",
    group: "notes",
    included: "free",
    comingSoon: false,
    name: "Notas sem limite neste aparelho",
  },
  {
    id: "editor",
    group: "notes",
    included: "free",
    comingSoon: false,
    name: "Editor visual com / e @",
  },
  {
    id: "links",
    group: "notes",
    included: "free",
    comingSoon: false,
    name: "Ligações entre notas",
  },
  { id: "canvas", group: "notes", included: "free", comingSoon: false, name: "Canvas" },
  { id: "notebook", group: "notes", included: "free", comingSoon: false, name: "Caderno" },
  {
    id: "atlas",
    group: "notes",
    included: "free",
    comingSoon: false,
    name: "Atlas com a passagem citada",
  },
  {
    id: "figures",
    group: "notes",
    included: "free",
    comingSoon: false,
    name: "Figuras e figurinhas, com exportação",
  },
  {
    id: "locks",
    group: "notes",
    included: "free",
    comingSoon: false,
    name: "Notas trancadas, com criptografia neste aparelho",
  },
  {
    id: "share",
    group: "notes",
    included: "plus",
    comingSoon: true,
    name: "Notas compartilhadas com contatos",
  },
  {
    id: "chat",
    group: "notes",
    included: "plus",
    comingSoon: true,
    name: "Conversa dentro das notas",
  },
  {
    id: "photos",
    group: "media",
    included: "free",
    comingSoon: false,
    name: "Fotos, câmera e vídeo nas notas",
  },
  {
    id: "long-media",
    group: "media",
    included: "plus",
    comingSoon: true,
    name: "Áudio mais longo e vídeo redondo",
  },
  { id: "routes", group: "maps", included: "free", comingSoon: false, name: "Mapas com rotas" },
  {
    id: "flights",
    group: "maps",
    included: "free",
    comingSoon: false,
    name: "Acompanhamento de voo",
  },
  { id: "alerts", group: "maps", included: "free", comingSoon: false, name: "Alertas de lugar" },
  { id: "draw", group: "maps", included: "free", comingSoon: false, name: "Mapa e desenhar área" },
  {
    id: "idea",
    group: "ai",
    included: "free",
    comingSoon: false,
    name: "Proponha uma ideia, com a sua chave",
  },
  {
    id: "ask-map",
    group: "ai",
    included: "free",
    comingSoon: false,
    name: "Pergunte ao mapa, com a sua chave",
  },
  {
    id: "included-ai",
    group: "ai",
    included: "plus",
    comingSoon: true,
    name: "IA incluída, sem chave, com limite mensal",
  },
  {
    id: "sync",
    group: "account",
    included: "plus",
    comingSoon: true,
    name: "Conta e sincronização criptografada entre aparelhos",
  },
  {
    id: "backup",
    group: "account",
    included: "plus",
    comingSoon: true,
    name: "Cópia de segurança criptografada na nuvem",
  },
];

export function planById(id: PlanId): PlanOffer {
  const plan = plans.find((item) => item.id === id);
  if (!plan) throw new Error(`Plano desconhecido: ${id}`);
  return plan;
}

export function planIncludes(minimum: PlanId, plan: PlanId): boolean {
  return rank[plan] >= rank[minimum];
}

export function shownCents(plan: PlanOffer, interval: BillingInterval): number {
  return interval === "yearly" ? plan.yearlyCents : plan.monthlyCents;
}

export function yearlySavingCents(plan: PlanOffer): number {
  return plan.monthlyCents * 12 - plan.yearlyCents;
}

export function yearlyDiscountPercent(plan: PlanOffer): number {
  const full = plan.monthlyCents * 12;
  if (full <= 0) return 0;
  return Math.round((1 - plan.yearlyCents / full) * 100);
}

export function formatBRL(reais: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(reais);
}

export function priceLabel(plan: PlanOffer, interval: BillingInterval): string {
  if (plan.monthlyCents === 0 && plan.yearlyCents === 0) return "Para sempre, neste aparelho.";
  const saved = formatBRL(yearlySavingCents(plan) / 100);
  const percent = yearlyDiscountPercent(plan);
  if (interval === "yearly") return `Economia de ${saved} no ano, cerca de ${percent}% a menos.`;
  return `No ano, ${formatBRL(plan.yearlyCents / 100)} — cerca de ${percent}% a menos.`;
}

export function readPlusNotify(storage: Pick<FlagStore, "getItem">): boolean {
  return storage.getItem(PLUS_NOTIFY_KEY) === "1";
}

export function writePlusNotify(
  storage: Pick<FlagStore, "setItem" | "removeItem">,
  on: boolean,
): void {
  if (on) storage.setItem(PLUS_NOTIFY_KEY, "1");
  else storage.removeItem(PLUS_NOTIFY_KEY);
}

export function readDevicePlusNotify(): boolean {
  if (typeof localStorage === "undefined") return false;
  return readPlusNotify(localStorage);
}

export function writeDevicePlusNotify(on: boolean): void {
  if (typeof localStorage === "undefined") return;
  writePlusNotify(localStorage, on);
}
