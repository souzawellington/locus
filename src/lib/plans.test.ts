import assert from "node:assert/strict";
import { test } from "node:test";
import {
  featureGroups,
  features,
  formatBRL,
  planById,
  planIncludes,
  PLUS_NOTIFY_KEY,
  priceLabel,
  readPlusNotify,
  shownCents,
  writePlusNotify,
  yearlyDiscountPercent,
  yearlySavingCents,
} from "./plans.ts";

test("Locus has two plans and the published prices", () => {
  const free = planById("free");
  const plus = planById("plus");
  assert.equal(free.name, "Grátis");
  assert.equal(plus.name, "Plus");
  assert.equal(shownCents(free, "monthly"), 0);
  assert.equal(shownCents(free, "yearly"), 0);
  assert.equal(shownCents(plus, "monthly"), 1490);
  assert.equal(shownCents(plus, "yearly"), 11900);
  assert.equal(yearlySavingCents(plus), 5980);
  assert.equal(yearlyDiscountPercent(plus), 33);
  assert.equal(yearlyDiscountPercent(free), 0);
  assert.match(formatBRL(14.9), /14,90/);
  assert.match(formatBRL(119), /119/);
  assert.match(priceLabel(plus, "yearly"), /59,80/);
  assert.match(priceLabel(plus, "yearly"), /33%/);
  assert.match(priceLabel(free, "monthly"), /Para sempre/);
});

test("free rows are in both plans and future rows are Plus only", () => {
  const groups = featureGroups.map((group) => group.id);
  assert.deepEqual(groups, ["notes", "media", "maps", "ai", "account"]);
  assert.equal(features.length > 0, true);
  for (const feature of features) {
    assert.equal(groups.includes(feature.group), true);
    assert.equal(planIncludes(feature.included, "plus"), true);
    assert.equal(planIncludes(feature.included, "free"), feature.included === "free");
    assert.equal(feature.comingSoon, feature.included === "plus");
    assert.equal(/análise|empresa|\$15|suporte 24/i.test(feature.name), false);
  }
  const names = features.map((feature) => feature.name).join("\n");
  for (const line of [
    "Notas sem limite neste aparelho",
    "Editor visual com / e @",
    "Ligações entre notas",
    "Canvas",
    "Caderno",
    "Atlas com a passagem citada",
    "Figuras e figurinhas, com exportação",
    "Notas trancadas, com criptografia neste aparelho",
    "Fotos, câmera e vídeo nas notas",
    "Mapas com rotas",
    "Acompanhamento de voo",
    "Alertas de lugar",
    "Mapa e desenhar área",
    "Proponha uma ideia, com a sua chave",
    "Pergunte ao mapa, com a sua chave",
    "Notas compartilhadas com contatos",
    "Conversa dentro das notas",
    "Áudio mais longo e vídeo redondo",
    "IA incluída, sem chave, com limite mensal",
    "Conta e sincronização criptografada entre aparelhos",
    "Cópia de segurança criptografada na nuvem",
  ]) {
    assert.equal(names.includes(line), true, line);
  }
});

test("the Plus reminder is one local flag and nothing else", () => {
  const keys = new Map<string, string>();
  const storage = {
    getItem: (key: string) => keys.get(key) ?? null,
    setItem: (key: string, value: string) => {
      keys.set(key, value);
    },
    removeItem: (key: string) => {
      keys.delete(key);
    },
  };
  assert.equal(readPlusNotify(storage), false);
  writePlusNotify(storage, true);
  assert.deepEqual([...keys.keys()], [PLUS_NOTIFY_KEY]);
  assert.equal(keys.get(PLUS_NOTIFY_KEY), "1");
  assert.equal(readPlusNotify(storage), true);
  writePlusNotify(storage, false);
  assert.equal(keys.size, 0);
});
