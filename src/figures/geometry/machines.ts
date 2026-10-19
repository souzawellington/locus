/**
 * Concept → machine, before geometry (Anatomy, Figure size):
 * - wikilinks: a patch bay. The cord seats in a jack and the return lamp lights.
 * - crdt: a composing stick. Two slugs merge by identity, with no referee.
 * - embeddings: a bench comparator. The score is computed on the instrument.
 * - notebook: a train of balances. A lower beam waits for the one it reads.
 * - atlas: a fiche reader. The finger rests only on a line that exists.
 * - canvas: a drafting board. A card moves; the sheet is not copied.
 * - approval: a press with a gate. The platen drops only after the lever arms.
 * - local-vault: a desk safe. The export is a slip you draw out yourself.
 * WebGL and the 3D turn mode are not used: these stay SVG so a sticker stays sharp.
 */
import type { Group, Item, Plan } from "./common.ts";
import { HEIGHT, P, WIDTH, baseGroup, cyl, k, rule, screws, slab } from "./common.ts";

export type Machine = {
  slug: string;
  fig: string;
  title: string;
  blurb: string;
  hint: string;
  caption: string;
  width: number;
  height: number;
  projection: typeof P;
  groups: Group[];
  read: (t: number, apart: number) => string;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function knob(id: string, x: number, y: number, z: number, r = 3.2, h = 5): Item[] {
  return [
    cyl(id, x, y, r, z, h, "mid", { steps: 18 }),
    rule(`${id}-knurl`, k.knurl(x, y, r, z + 0.6, z + h - 0.4, 16, P, 0.25), [x, y, z + h], "lo"),
    rule(`${id}-slot`, k.lineOnTop([x - r + 0.8, y], [x + r - 0.8, y], z + h, P), [x, y, z + h], "hi"),
  ];
}

function wikilinks(): Pick<Machine, "groups" | "read"> {
  const groups: Group[] = [baseGroup()];
  const towers: Item[] = [];
  for (const [index, x] of [-48, 48].entries()) {
    towers.push(slab(`pedestal-${index}`, { x: x - 11, y: -18, w: 22, d: 22, r: 2 }, 0, 5, "mid"));
    towers.push(cyl(`post-${index}`, x, -7, 3.4, 5, 36, "mid", { steps: 18 }));
    towers.push(cyl(`collar-${index}`, x, -7, 5.2, 38, 3.2, "hi", { steps: 20 }));
    towers.push(cyl(`lamp-${index}`, x, -7, 3.6, 41.2, 2.4, "hi", { lit: true, steps: 16 }));
    towers.push(...screws(`jack-${index}`, [[x - 7, 0, 5], [x + 7, 0, 5]]));
  }
  groups.push({ id: "towers", place: (_t, apart) => [0, 0, apart * 6], items: towers });

  const carriage: Item[] = [];
  carriage.push(slab("boom", { x: -78, y: 16, w: 156, d: 7, r: 1.4 }, 18, 4, "mid", { bevel: 0.4 }));
  carriage.push(slab("stop-l", { x: -84, y: 13, w: 6, d: 13, r: 1 }, 16, 8, "mid"));
  carriage.push(slab("stop-r", { x: 78, y: 13, w: 6, d: 13, r: 1 }, 16, 8, "mid"));
  carriage.push(slab("sled", { x: -58, y: 12, w: 20, d: 16, r: 2 }, 22, 5, "hi", { bevel: 0.5 }));
  carriage.push(cyl("plug", -48, 8, 2.6, 8, 14, "hi", { lit: true, steps: 16 }));
  carriage.push(cyl("cord-a", -48, 20, 1.5, 22, 6, "lo", { crease: "none", bevel: 0 }));
  carriage.push(cyl("cord-b", -48, 28, 1.5, 16, 8, "lo", { crease: "none", bevel: 0 }));
  carriage.push(...knob("sled-knob", -48, 34, 22, 3.4, 5));
  groups.push({
    id: "carriage",
    place: (t, apart) => [t * 96, 0, apart * 22],
    items: carriage,
  });
  return {
    groups,
    read: (t) => (t < 0.12 || t > 0.88 ? "2 vias · ida e volta" : "cabo entre as tomadas"),
  };
}

function crdt(): Pick<Machine, "groups" | "read"> {
  const stick: Item[] = [];
  stick.push(slab("bed", { x: -70, y: -8, w: 140, d: 28, r: 2 }, 0, 4, "mid"));
  stick.push(slab("wall-a", { x: -70, y: -12, w: 140, d: 5, r: 1 }, 4, 14, "hi"));
  stick.push(slab("wall-b", { x: -70, y: 16, w: 140, d: 5, r: 1 }, 4, 14, "hi"));
  stick.push(slab("chute-l", { x: -108, y: -6, w: 28, d: 22, r: 2 }, 4, 22, "mid"));
  stick.push(slab("chute-r", { x: 80, y: -6, w: 28, d: 22, r: 2 }, 4, 22, "mid"));
  stick.push(rule("identity", k.lineOnTop([-40, 2], [20, 2], 4.2, P), [0, 2, 4], "faint"));
  const slug = (id: string, x: number, lit = false): Item[] => [
    slab(id, { x, y: -2, w: 16, d: 14, r: 1.2 }, 4, 8, "hi", { lit, bevel: 0.4 }),
    rule(`${id}-mark`, k.lineOnTop([x + 3, 2], [x + 13, 2], 12.1, P), [x, 2, 12], "lo"),
    ...screws(`${id}-pin`, [[x + 8, 5, 12.1]], 0.36),
  ];
  return {
    groups: [
      baseGroup(),
      { id: "stick", place: () => [0, 0, 0], items: stick },
      { id: "slug-a", place: (_t, apart) => [0, 0, apart * 16], items: slug("slug-a", -36) },
      {
        id: "slug-b",
        place: (t, apart) => [-t * 78, 0, apart * 26],
        items: slug("slug-b", 86, true),
      },
    ],
    read: (t) => (t > 0.82 ? "fundido · sem árbitro" : "duas edições, ainda separadas"),
  };
}

function embeddings(): Pick<Machine, "groups" | "read"> {
  const stage: Item[] = [];
  stage.push(slab("mat", { x: -78, y: -28, w: 120, d: 52, r: 2 }, 0, 2, "lo", { flat: true, crease: "none" }));
  stage.push(slab("column", { x: 52, y: -8, w: 16, d: 16, r: 2 }, 0, 28, "mid"));
  stage.push(cyl("hub", 60, 0, 4, 28, 4, "mid"));
  stage.push(...screws("mat-screws", [[-70, -20, 2.1], [-70, 16, 2.1], [34, -20, 2.1]]));
  const pins: Item[] = [];
  for (let index = 0; index < 7; index += 1) {
    const x = -58 + index * 9;
    pins.push(cyl(`pin-${index}`, x, 36, 1.1, 2, 3 + (index % 3), "hi", { steps: 10, bevel: 0 }));
  }
  const card: Item[] = [
    slab("card", { x: -46, y: -16, w: 34, d: 26, r: 1.2 }, 2, 1.2, "hi", { lit: true, flat: true, crease: "none" }),
    rule("card-a", k.lineOnTop([-40, -8], [-16, -8], 3.3, P), [-30, -8, 3], "lo"),
    rule("card-b", k.lineOnTop([-40, -2], [-18, -2], 3.3, P), [-30, -2, 3], "faint"),
    rule("card-c", k.lineOnTop([-40, 4], [-22, 4], 3.3, P), [-30, 4, 3], "faint"),
  ];
  const lens: Item[] = [
    slab("arm", { x: 28, y: -4, w: 40, d: 8, r: 2 }, 30, 4, "mid"),
    cyl("barrel", -4, 0, 8, 34, 7, "hi", { steps: 24 }),
    cyl("glass", -4, 0, 5.2, 41, 1.6, "hi", { lit: true, steps: 20 }),
    ...knob("focus", 8, 0, 36, 2.4, 4),
  ];
  return {
    groups: [
      baseGroup(),
      { id: "stage", place: () => [0, 0, 0], items: [...stage, ...pins] },
      { id: "card", place: (t) => [(t - 0.5) * 36, 0, 0], items: card },
      { id: "lens", place: (_t, apart) => [0, 0, apart * 20], items: lens },
    ],
    read: (t) => {
      const align = 1 - Math.abs(t - 0.5) * 2;
      const score = Math.round((0.41 + clamp(align) * 0.5) * 100) / 100;
      return `cosseno ${score.toFixed(2)} · no aparelho`;
    },
  };
}

function notebook(): Pick<Machine, "groups" | "read"> {
  const frame: Item[] = [slab("plinth", { x: -96, y: -10, w: 192, d: 36, r: 2 }, 0, 4, "mid")];
  const beams: Group[] = [];
  const names = ["amostra", "média", "resumo"];
  for (let index = 0; index < 3; index += 1) {
    const x = -78 + index * 58;
    frame.push(cyl(`post-${index}`, x, 8, 2.6, 4, 22, "mid", { steps: 14 }));
    frame.push(cyl(`knife-${index}`, x, 8, 1.2, 26, 2, "hi", { steps: 12 }));
    const beam: Item[] = [
      slab(`beam-${index}`, { x: x - 16, y: 5, w: 32, d: 6, r: 1 }, 28, 3, "hi", { lit: index === 2, bevel: 0.3 }),
      cyl(`pan-${index}`, x + 12, 8, 4.2, 18, 3, "mid", { steps: 16 }),
      cyl(`bob-${index}`, x + 12, 8, 1.3, 21, 7, "lo", { steps: 10, bevel: 0 }),
    ];
    beams.push({
      id: `beam-${index}`,
      place: (t, apart) => {
        const start = index * 0.3;
        const settled = clamp((t - start) / 0.3);
        return [0, 0, -settled * 6 + apart * (12 + index * 7)];
      },
      items: beam,
    });
  }
  return {
    groups: [baseGroup(), { id: "frame", place: () => [0, 0, 0], items: frame }, ...beams],
    read: (t) => {
      const ready = names.filter((_, index) => t > index * 0.3 + 0.3);
      return ready.length ? ready.join(" → ") : "ainda sem ordem";
    },
  };
}

function atlas(): Pick<Machine, "groups" | "read"> {
  const desk: Item[] = [];
  desk.push(slab("fiche-bed", { x: -72, y: -22, w: 110, d: 48, r: 2 }, 0, 3, "mid"));
  desk.push(slab("fiche", { x: -64, y: -16, w: 94, d: 36, r: 1 }, 3, 0.8, "lo", { flat: true, crease: "none" }));
  for (let index = 0; index < 4; index += 1) {
    const y = -8 + index * 6;
    desk.push(rule(`line-${index}`, k.lineOnTop([-56, y], [22, y], 3.9, P), [0, y, 4], index === 1 ? "mid" : "faint"));
  }
  desk.push(cyl("stand", 62, -4, 3, 0, 30, "mid", { steps: 14 }));
  desk.push(...screws("fiche-screws", [[-66, -16, 3.1], [32, -16, 3.1], [-66, 20, 3.1]]));
  const glass: Item[] = [slab("glass", { x: -60, y: -14, w: 86, d: 32, r: 1 }, 6, 1.2, "hi", { flat: true, crease: "none", lit: true })];
  const finger: Item[] = [
    slab("arm", { x: 20, y: -2, w: 48, d: 6, r: 1.5 }, 32, 3.5, "mid"),
    cyl("tip", -8, 1, 1.8, 24, 8, "hi", { lit: true, steps: 12 }),
    ...knob("arm-knob", 64, 1, 32, 2.8, 4),
  ];
  const lines = ["CRDT", "caderno", "cofre", "canvas"];
  return {
    groups: [
      baseGroup(),
      { id: "desk", place: () => [0, 0, 0], items: desk },
      { id: "glass", place: (_t, apart) => [0, 0, apart * 14], items: glass },
      { id: "finger", place: (t, apart) => [(t - 0.35) * 28, 0, apart * 18], items: finger },
    ],
    read: (t) => `citação · ${lines[Math.round(clamp(t) * (lines.length - 1))] ?? lines[0]}`,
  };
}

function canvas(): Pick<Machine, "groups" | "read"> {
  const board: Item[] = [];
  board.push(slab("board", { x: -88, y: -36, w: 168, d: 96, r: 3 }, 0, 3, "lo", { bevel: 0.8 }));
  board.push(rule("board-edge", k.planOutline(k.insetPlan({ x: -88, y: -36, w: 168, d: 96, r: 3 }, 4), 3.1, P), [0, 0, 3], "faint"));
  board.push(slab("square", { x: -96, y: 40, w: 150, d: 7, r: 1 }, 3, 2.2, "mid", { bevel: 0.3 }));
  const cards: Array<{ id: string; plan: Plan; lit?: boolean }> = [
    { id: "card-a", plan: { x: -70, y: -20, w: 42, d: 28, r: 1.5 } },
    { id: "card-b", plan: { x: -16, y: -8, w: 42, d: 28, r: 1.5 }, lit: true },
    { id: "card-c", plan: { x: 36, y: 8, w: 42, d: 28, r: 1.5 } },
  ];
  const groups: Group[] = [baseGroup(), { id: "board", place: () => [0, 0, 0], items: board }];
  cards.forEach((card, index) => {
    const items: Item[] = [
      slab(card.id, card.plan, 3, 1.4, "hi", { lit: card.lit, flat: true, crease: "none" }),
      rule(`${card.id}-title`, k.lineOnTop([card.plan.x + 4, card.plan.y + 8], [card.plan.x + card.plan.w - 4, card.plan.y + 8], 4.5, P), [card.plan.x, card.plan.y, 5], "lo"),
      rule(`${card.id}-body`, k.lineOnTop([card.plan.x + 4, card.plan.y + 14], [card.plan.x + card.plan.w - 10, card.plan.y + 14], 4.5, P), [card.plan.x, card.plan.y, 5], "faint"),
      cyl(`${card.id}-pin`, card.plan.x + card.plan.w / 2, card.plan.y + 4, 1.1, 4.4, 2.2, "mid", { steps: 10 }),
    ];
    groups.push({
      id: card.id,
      place: (t, apart) => (index === 1 ? [(t - 0.4) * 24, (t - 0.4) * 10, apart * 14] : [0, 0, apart * (8 + index * 4)]),
      items,
    });
  });
  return {
    groups,
    read: (t) => `1 nota · movida ${Math.round(Math.abs(t - 0.4) * 10)}`,
  };
}

function approval(): Pick<Machine, "groups" | "read"> {
  const press: Item[] = [];
  press.push(slab("anvil", { x: -46, y: -20, w: 92, d: 48, r: 2 }, 0, 6, "mid", { bevel: 0.8 }));
  press.push(cyl("post-l", -38, 4, 3.2, 6, 40, "mid", { steps: 14 }));
  press.push(cyl("post-r", 38, 4, 3.2, 6, 40, "mid", { steps: 14 }));
  press.push(slab("head", { x: -46, y: -4, w: 92, d: 16, r: 2 }, 46, 6, "hi", { bevel: 0.5 }));
  press.push(slab("gate", { x: 52, y: -8, w: 8, d: 28, r: 1 }, 8, 16, "lo", { bevel: 0.3 }));
  press.push(...screws("anvil-screws", [[-38, -12, 6.1], [38, -12, 6.1], [-38, 20, 6.1], [38, 20, 6.1]]));
  const lever: Item[] = [
    slab("lever", { x: 58, y: -2, w: 36, d: 5, r: 1.2 }, 18, 3, "hi", { lit: true, bevel: 0.3 }),
    cyl("pivot", 60, 0, 2.2, 16, 7, "mid", { steps: 12 }),
    ...knob("lever-knob", 90, 0, 18, 3, 4),
  ];
  const platen: Item[] = [
    slab("platen", { x: -28, y: -10, w: 56, d: 32, r: 2 }, 28, 8, "hi", { lit: true, bevel: 0.6 }),
    cyl("ram", 0, 6, 3, 36, 10, "mid", { steps: 14 }),
  ];
  return {
    groups: [
      baseGroup(),
      { id: "press", place: () => [0, 0, 0], items: press },
      { id: "lever", place: (t, apart) => [0, Math.min(1, t / 0.45) * 10, apart * 4], items: lever },
      {
        id: "platen",
        place: (t, apart) => [0, 0, -(t > 0.45 ? (t - 0.45) / 0.55 : 0) * 12 + apart * 20],
        items: platen,
      },
    ],
    read: (t) => (t > 0.45 ? "gravou · depois do sim" : "trava fechada"),
  };
}

function localVault(): Pick<Machine, "groups" | "read"> {
  const body: Item[] = [];
  body.push(slab("case", { x: -58, y: -32, w: 116, d: 72, r: 3 }, 0, 36, "mid", { bevel: 1.1, steps: 6 }));
  body.push(rule("seam", k.planOutline(k.insetPlan({ x: -58, y: -32, w: 116, d: 72, r: 3 }, 5), 36.1, P), [0, 0, 36], "faint"));
  body.push(cyl("hinge-a", -58, -8, 2.4, 8, 6, "hi", { steps: 12 }));
  body.push(cyl("hinge-b", -58, 14, 2.4, 8, 6, "hi", { steps: 12 }));
  body.push(...knob("dial", 18, 4, 36, 6, 3));
  body.push(...screws("case-screws", [[-40, -22, 36.1], [40, -22, 36.1], [40, 28, 36.1]]));
  const door: Item[] = [
    slab("door", { x: -50, y: -24, w: 100, d: 56, r: 2 }, 36, 3.2, "hi", { bevel: 0.5 }),
    slab("pull", { x: 28, y: -2, w: 8, d: 16, r: 1.5 }, 39.2, 3, "mid", { bevel: 0.3 }),
  ];
  const slip: Item[] = [
    slab("drawer", { x: -36, y: 30, w: 72, d: 18, r: 1.4 }, 6, 8, "hi", { lit: true, bevel: 0.4 }),
    rule("slip-line", k.lineOnTop([-28, 38], [28, 38], 14.1, P), [0, 38, 14], "lo"),
    ...knob("drawer-pull", 0, 46, 8, 2.6, 4),
  ];
  return {
    groups: [
      baseGroup(),
      { id: "case", place: () => [0, 0, 0], items: body },
      { id: "door", place: (_t, apart) => [apart * 28, 0, 0], items: door },
      { id: "drawer", place: (t) => [0, t * 22, 0], items: slip },
    ],
    read: (t, apart) => (apart > 0.4 ? "porta aberta · o texto ficou" : t > 0.2 ? "gaveta de exportação" : "texto no cofre"),
  };
}

const specs: Array<Omit<Machine, "width" | "height" | "projection"> & { hint: string }> = [
  {
    slug: "wikilinks",
    fig: "01",
    title: "Ligações",
    blurb: "Um cabo entre duas tomadas. As duas lâmpadas acendem juntas.",
    hint: "toque para desmontar",
    caption: "A ligação e o retorno são o mesmo cabo. Não há uma segunda cópia da nota.",
    ...wikilinks(),
  },
  {
    slug: "crdt",
    fig: "02",
    title: "Compositor",
    blurb: "Dois tipos caem no mesmo componedor e fundem sem árbitro.",
    hint: "toque para desmontar",
    caption: "Cada tipo traz a sua marca. A ordem sai das marcas, não de quem chegou primeiro.",
    ...crdt(),
  },
  {
    slug: "embeddings",
    fig: "03",
    title: "Comparador",
    blurb: "A ficha é medida no aparelho. O número não sai da bancada.",
    hint: "toque para desmontar",
    caption: "O cosseno é a coincidência entre a ficha e a lente, calculada aqui.",
    ...embeddings(),
  },
  {
    slug: "notebook",
    fig: "04",
    title: "Balanças",
    blurb: "A trave de baixo espera a de cima. A ordem é a dependência.",
    hint: "toque para desmontar",
    caption: "Amostra, média e resumo assentam por sua vez. A posição na mesa não manda.",
    ...notebook(),
  },
  {
    slug: "atlas",
    fig: "05",
    title: "Leitor",
    blurb: "O dedo só pousa numa linha que está na ficha.",
    hint: "toque para desmontar",
    caption: "A citação é a linha sob o dedo. Se a linha não existe, o braço não inventa uma.",
    ...atlas(),
  },
  {
    slug: "canvas",
    fig: "06",
    title: "Prancheta",
    blurb: "O cartão muda de lugar. A folha continua a ser a mesma.",
    hint: "toque para desmontar",
    caption: "Mover no plano não copia o texto. A proximidade é o argumento.",
    ...canvas(),
  },
  {
    slug: "approval",
    fig: "07",
    title: "Prensa",
    blurb: "O prato só desce depois da alavanca. Sem o sim, não grava.",
    hint: "toque para desmontar",
    caption: "A trava arma primeiro. O golpe é a escrita, e espera essa armação.",
    ...approval(),
  },
  {
    slug: "local-vault",
    fig: "08",
    title: "Cofre",
    blurb: "O texto fica na caixa. Exportar é puxar a gaveta.",
    hint: "toque para desmontar",
    caption: "Abrir a porta não envia nada. A gaveta é o único papel que sai.",
    ...localVault(),
  },
];

export const MACHINES: Machine[] = specs.map((spec) => ({
  ...spec,
  width: WIDTH,
  height: HEIGHT,
  projection: P,
}));

export function machineBySlug(slug: string): Machine | undefined {
  return MACHINES.find((machine) => machine.slug === slug);
}

export const FIGURES = MACHINES.map((machine) => ({
  slug: machine.slug,
  fig: machine.fig,
  title: machine.title,
  blurb: machine.blurb,
}));
