import { parseFigureSpec, type FigureIdeaSpec, type FigurePart, type KinematicJoint, type Vector3 } from "./schema.ts";

const fixed = (origin: Vector3): KinematicJoint => ({
  type: "fixed",
  axis: [0, 0, 1],
  origin,
  range: [0, 0],
  minClearanceMm: 1.5,
});

function part(input: FigurePart): FigurePart {
  return input;
}

export function benchSpec(): FigureIdeaSpec {
  return parseFigureSpec({
    id: "fig-bancada",
    title: "Bancada de prova",
    subtitle: "O carro corre 22 mm sobre o trilho.",
    domain: "mechanism",
    projection: { type: "isometric", azimuthDeg: 45, elevationDeg: 35.264, scale: 1 },
    defaultParameterT: 0.25,
    parameterLabel: "curso",
    parts: [
      part({
        id: "base",
        label: "Base da bancada",
        technicalRole: "A base mede 100 mm por 56 mm e tem 8 mm de espessura.",
        strokeTier: "silhouette",
        surfaceTone: "base",
        joint: fixed([0, 0, 4]),
        primitives: [{ kind: "iso-prism", center: [0, 0, 4], dimensions: [100, 56, 8], chamfer: 0 }],
        calloutAnchor: [0, -32, 8],
      }),
      part({
        id: "coluna",
        label: "Coluna do relógio",
        technicalRole: "A coluna sobe 40 mm com 5 mm de raio.",
        strokeTier: "silhouette",
        surfaceTone: "elevated",
        joint: fixed([-36, 0, 8]),
        primitives: [
          {
            kind: "lathe",
            axisOrigin: [-36, 0, 8],
            axisDirection: [0, 0, 1],
            profile: [
              { axial: 0, radius: 5 },
              { axial: 36, radius: 5 },
              { axial: 40, radius: 7 },
            ],
            segments: 16,
          },
        ],
        calloutAnchor: [-36, -18, 28],
      }),
      part({
        id: "trilho",
        label: "Trilho de aço",
        technicalRole: "O trilho mede 64 mm e fica 3 mm acima da base.",
        strokeTier: "silhouette",
        surfaceTone: "elevated",
        joint: fixed([12, 0, 14]),
        primitives: [{ kind: "iso-prism", center: [12, 0, 14], dimensions: [64, 10, 6], chamfer: 0.6 }],
        calloutAnchor: [12, 16, 17],
      }),
      part({
        id: "carro",
        label: "Carro do ensaio",
        technicalRole: "O carro avança 22 mm ao longo do trilho.",
        telemetryUnit: "mm",
        telemetryFormula: { base: 0, slope: 22, precision: 1 },
        strokeTier: "silhouette",
        surfaceTone: "accent",
        joint: { type: "prismatic", axis: [1, 0, 0], origin: [12, 0, 26], range: [0, 22], minClearanceMm: 1.5 },
        primitives: [{ kind: "iso-prism", center: [12, 0, 26], dimensions: [18, 16, 10], chamfer: 0 }],
        calloutAnchor: [12, -16, 31],
      }),
      part({
        id: "apalpador",
        label: "Haste do apalpador",
        technicalRole: "A haste tem 14 mm de altura e 2 mm de raio.",
        strokeTier: "crease",
        surfaceTone: "elevated",
        joint: { type: "prismatic", axis: [1, 0, 0], origin: [12, 0, 31], range: [0, 22], minClearanceMm: 1.5 },
        primitives: [
          {
            kind: "lathe",
            axisOrigin: [12, 0, 31],
            axisDirection: [0, 0, 1],
            profile: [
              { axial: 0, radius: 2 },
              { axial: 14, radius: 2 },
            ],
            segments: 12,
          },
        ],
        calloutAnchor: [12, 0, 48],
      }),
      part({
        id: "cabo",
        label: "Cabo do sensor",
        technicalRole: "O cabo tem 1,2 mm de raio e curva com 6 mm.",
        strokeTier: "crease",
        surfaceTone: "base",
        joint: fixed([0, 24, 46]),
        primitives: [
          {
            kind: "tube",
            waypoints: [
              [-36, 20, 44],
              [0, 26, 48],
              [16, 22, 40],
            ],
            radius: 1.2,
            bendRadius: 6,
          },
        ],
        calloutAnchor: [0, 30, 48],
      }),
    ],
  });
}

export function dialSpec(): FigureIdeaSpec {
  return parseFigureSpec({
    id: "fig-relogio",
    title: "Relógio comparador",
    subtitle: "O ponteiro gira 100° sobre o mostrador.",
    domain: "metrology",
    projection: { type: "isometric", azimuthDeg: 45, elevationDeg: 35.264, scale: 1 },
    defaultParameterT: 0.25,
    parameterLabel: "ângulo",
    parts: [
      part({
        id: "pe",
        label: "Pé do suporte",
        technicalRole: "O pé mede 70 mm por 40 mm.",
        strokeTier: "silhouette",
        surfaceTone: "base",
        joint: fixed([0, 0, 3]),
        primitives: [{ kind: "iso-prism", center: [0, 0, 3], dimensions: [70, 40, 6], chamfer: 0 }],
        calloutAnchor: [20, -24, 6],
      }),
      part({
        id: "haste",
        label: "Haste do suporte",
        technicalRole: "A haste sobe 40 mm com 3,2 mm de raio.",
        strokeTier: "silhouette",
        surfaceTone: "elevated",
        joint: fixed([-18, 0, 6]),
        primitives: [
          {
            kind: "lathe",
            axisOrigin: [-18, 0, 6],
            axisDirection: [0, 0, 1],
            profile: [
              { axial: 0, radius: 3.2 },
              { axial: 40, radius: 3.2 },
            ],
            segments: 16,
          },
        ],
        calloutAnchor: [-28, -12, 26],
      }),
      part({
        id: "mostrador",
        label: "Mostrador do relógio",
        technicalRole: "O mostrador tem 24 mm de diâmetro e 5 mm de espessura.",
        strokeTier: "silhouette",
        surfaceTone: "elevated",
        joint: fixed([-18, 0, 46]),
        primitives: [
          {
            kind: "lathe",
            axisOrigin: [-18, 0, 46],
            axisDirection: [0, 0, 1],
            profile: [
              { axial: 0, radius: 12 },
              { axial: 5, radius: 12 },
            ],
            segments: 20,
          },
        ],
        calloutAnchor: [-18, 18, 51],
      }),
      part({
        id: "ponteiro",
        label: "Ponteiro do relógio",
        technicalRole: "O ponteiro varre de -50° a 50° em torno do eixo.",
        telemetryUnit: "°",
        telemetryFormula: { base: -50, slope: 100, precision: 0 },
        strokeTier: "silhouette",
        surfaceTone: "accent",
        joint: { type: "revolute", axis: [0, 0, 1], origin: [-18, 0, 54.2], range: [-50, 50], minClearanceMm: 1.5 },
        primitives: [
          {
            kind: "lathe",
            axisOrigin: [-18, 0, 54.2],
            axisDirection: [1, 0, 0],
            profile: [
              { axial: 2, radius: 0.45 },
              { axial: 13, radius: 0.45 },
            ],
            segments: 12,
          },
        ],
        calloutAnchor: [-4, 0, 56],
      }),
      part({
        id: "botao",
        label: "Botão de zeragem",
        technicalRole: "O botão tem 5 mm de raio e 7 mm de altura.",
        strokeTier: "crease",
        surfaceTone: "elevated",
        joint: fixed([16, 0, 6]),
        primitives: [
          {
            kind: "lathe",
            axisOrigin: [16, 0, 6],
            axisDirection: [0, 0, 1],
            profile: [
              { axial: 0, radius: 5 },
              { axial: 7, radius: 5 },
            ],
            segments: 16,
          },
        ],
        calloutAnchor: [16, 14, 13],
      }),
    ],
  });
}

export function nozzleSpec(): FigureIdeaSpec {
  return parseFigureSpec({
    id: "fig-bico",
    title: "Bico de ensaio",
    subtitle: "O bico abre 30 mm e a braçadeira sai para o lado.",
    domain: "aerospace",
    projection: { type: "isometric", azimuthDeg: 45, elevationDeg: 35.264, scale: 1 },
    defaultParameterT: 0.25,
    parameterLabel: "curso",
    parts: [
      part({
        id: "berco",
        label: "Berço de ensaio",
        technicalRole: "O berço mede 84 mm por 44 mm.",
        strokeTier: "silhouette",
        surfaceTone: "base",
        joint: fixed([0, 0, 5]),
        primitives: [{ kind: "iso-prism", center: [0, 0, 5], dimensions: [84, 44, 10], chamfer: 0 }],
        calloutAnchor: [0, -28, 10],
      }),
      part({
        id: "camara",
        label: "Câmara de combustão",
        technicalRole: "A câmara sobe 30 mm e chega a 13 mm de raio.",
        strokeTier: "silhouette",
        surfaceTone: "elevated",
        joint: fixed([0, 0, 10]),
        primitives: [
          {
            kind: "lathe",
            axisOrigin: [0, 0, 10],
            axisDirection: [0, 0, 1],
            profile: [
              { axial: 0, radius: 9 },
              { axial: 10, radius: 9 },
              { axial: 24, radius: 13 },
              { axial: 30, radius: 11 },
            ],
            segments: 16,
          },
        ],
        calloutAnchor: [-20, -8, 28],
      }),
      part({
        id: "bico",
        label: "Bico convergente",
        technicalRole: "O bico desce de 11 mm para 3 mm de raio em 30 mm.",
        strokeTier: "section",
        surfaceTone: "cutaway",
        joint: fixed([0, 0, 40]),
        primitives: [
          {
            kind: "lathe",
            axisOrigin: [0, 0, 40],
            axisDirection: [0, 0, 1],
            profile: [
              { axial: 0, radius: 11 },
              { axial: 8, radius: 10 },
              { axial: 26, radius: 4 },
              { axial: 30, radius: 3 },
            ],
            segments: 16,
            cutawayAngleDeg: 80,
          },
        ],
        calloutAnchor: [16, 0, 62],
      }),
      part({
        id: "bracadeira",
        label: "Braçadeira lateral",
        technicalRole: "A braçadeira corre 26 mm para fora quando a peça abre.",
        telemetryUnit: "mm",
        telemetryFormula: { base: 0, slope: 26, precision: 0 },
        strokeTier: "silhouette",
        surfaceTone: "accent",
        joint: { type: "exploded-slide", axis: [1, 0, 0], origin: [32, 0, 28], range: [0, 26], minClearanceMm: 1.5 },
        primitives: [{ kind: "iso-prism", center: [32, 0, 28], dimensions: [12, 16, 18], chamfer: 0 }],
        calloutAnchor: [40, 0, 40],
      }),
      part({
        id: "linha",
        label: "Linha de combustível",
        technicalRole: "A linha tem 1,3 mm de raio e curva com 6 mm.",
        strokeTier: "crease",
        surfaceTone: "base",
        joint: fixed([24, 26, 30]),
        primitives: [
          {
            kind: "tube",
            waypoints: [
              [24, 22, 22],
              [30, 28, 36],
              [18, 24, 52],
            ],
            radius: 1.3,
            bendRadius: 6,
          },
        ],
        calloutAnchor: [34, 28, 36],
      }),
    ],
  });
}

export function tankSpec(): FigureIdeaSpec {
  return parseFigureSpec({
    id: "fig-tanque",
    title: "Tanque de ondas",
    subtitle: "O excitador corre 18 mm sobre a água.",
    domain: "wave-physics",
    projection: { type: "isometric", azimuthDeg: 42, elevationDeg: 35.264, scale: 1 },
    defaultParameterT: 0.25,
    parameterLabel: "posição",
    parts: [
      part({
        id: "bandeja",
        label: "Bandeja de papel",
        technicalRole: "A bandeja mede 90 mm por 50 mm.",
        strokeTier: "silhouette",
        surfaceTone: "base",
        joint: fixed([0, 0, 3]),
        primitives: [{ kind: "iso-prism", center: [0, 0, 3], dimensions: [90, 50, 6], chamfer: 0 }],
        calloutAnchor: [0, -30, 6],
      }),
      part({
        id: "pe",
        label: "Pé central",
        technicalRole: "O pé sobe 8 mm com 3 mm de raio.",
        strokeTier: "crease",
        surfaceTone: "elevated",
        joint: fixed([0, 0, 6]),
        primitives: [
          {
            kind: "lathe",
            axisOrigin: [0, 0, 6],
            axisDirection: [0, 0, 1],
            profile: [
              { axial: 0, radius: 3 },
              { axial: 8, radius: 3 },
            ],
            segments: 12,
          },
        ],
        calloutAnchor: [12, 0, 10],
      }),
      part({
        id: "cuba",
        label: "Cuba de vidro",
        technicalRole: "A cuba mede 70 mm por 36 mm e tem 16 mm de altura.",
        strokeTier: "silhouette",
        surfaceTone: "elevated",
        joint: fixed([0, 0, 22]),
        primitives: [{ kind: "iso-prism", center: [0, 0, 22], dimensions: [70, 36, 16], chamfer: 0 }],
        calloutAnchor: [-40, 0, 30],
      }),
      part({
        id: "lampada",
        label: "Lâmpada de topo",
        technicalRole: "A lâmpada fica 20 mm acima da cuba e tem 7 mm de raio.",
        strokeTier: "silhouette",
        surfaceTone: "accent",
        joint: fixed([0, 0, 50]),
        primitives: [
          {
            kind: "lathe",
            axisOrigin: [0, 0, 50],
            axisDirection: [0, 0, 1],
            profile: [
              { axial: 0, radius: 7 },
              { axial: 8, radius: 5 },
            ],
            segments: 16,
          },
        ],
        calloutAnchor: [0, 16, 58],
      }),
      part({
        id: "excitador",
        label: "Haste excitadora",
        technicalRole: "A haste corre 18 mm e para 2 mm acima da cuba.",
        telemetryUnit: "mm",
        telemetryFormula: { base: 0, slope: 18, precision: 1 },
        strokeTier: "silhouette",
        surfaceTone: "accent",
        joint: { type: "prismatic", axis: [1, 0, 0], origin: [-16, 0, 36], range: [0, 18], minClearanceMm: 1.5 },
        primitives: [
          {
            kind: "lathe",
            axisOrigin: [-16, 0, 36],
            axisDirection: [0, 0, -1],
            profile: [
              { axial: 0, radius: 1.4 },
              { axial: 4, radius: 1.4 },
            ],
            segments: 12,
          },
        ],
        calloutAnchor: [-16, -14, 36],
      }),
    ],
  });
}

export function plateSpec(): FigureIdeaSpec {
  return parseFigureSpec({
    id: "fig-placa",
    title: "Placa de gotas",
    subtitle: "A lâmina avança 14 mm ao lado da gota.",
    domain: "computing",
    projection: { type: "dimetric", azimuthDeg: 45, elevationDeg: 35.264, scale: 1 },
    defaultParameterT: 0.25,
    parameterLabel: "passo",
    parts: [
      part({
        id: "base",
        label: "Base da placa",
        technicalRole: "A base mede 80 mm por 48 mm.",
        strokeTier: "silhouette",
        surfaceTone: "base",
        joint: fixed([0, 0, 3]),
        primitives: [{ kind: "iso-prism", center: [0, 0, 3], dimensions: [80, 48, 6], chamfer: 0 }],
        calloutAnchor: [0, -28, 6],
      }),
      part({
        id: "placa",
        label: "Placa de vidro",
        technicalRole: "A placa mede 62 mm por 36 mm e tem 4 mm.",
        strokeTier: "silhouette",
        surfaceTone: "elevated",
        joint: fixed([0, 0, 8]),
        primitives: [{ kind: "iso-prism", center: [0, 0, 8], dimensions: [62, 36, 4], chamfer: 0 }],
        calloutAnchor: [24, 20, 10],
      }),
      part({
        id: "gota",
        label: "Gota de vidro",
        technicalRole: "A gota tem 4,5 mm de raio e 6 mm de altura.",
        strokeTier: "section",
        surfaceTone: "cutaway",
        joint: fixed([-14, 0, 10]),
        primitives: [
          {
            kind: "lathe",
            axisOrigin: [-14, 0, 10],
            axisDirection: [0, 0, 1],
            profile: [
              { axial: 0, radius: 4.5 },
              { axial: 6, radius: 4.5 },
            ],
            segments: 16,
          },
        ],
        calloutAnchor: [-14, -16, 16],
      }),
      part({
        id: "lamina",
        label: "Lâmina de folga",
        technicalRole: "A lâmina avança 14 mm e mantém 16 mm de folga da gota.",
        telemetryUnit: "mm",
        telemetryFormula: { base: 0, slope: 14, precision: 1 },
        strokeTier: "silhouette",
        surfaceTone: "accent",
        joint: { type: "prismatic", axis: [0, 1, 0], origin: [16, 0, 20], range: [0, 14], minClearanceMm: 1.5 },
        primitives: [{ kind: "iso-prism", center: [16, 0, 20], dimensions: [18, 5, 10], chamfer: 0 }],
        calloutAnchor: [28, 0, 25],
      }),
    ],
  });
}

export function exampleCatalog(): FigureIdeaSpec[] {
  return [benchSpec(), dialSpec(), nozzleSpec(), tankSpec(), plateSpec()];
}

export function fallbackFor(request: string): FigureIdeaSpec {
  const text = request.toLowerCase();
  if (/foguete|bico|motor|empuxo|nozzle|combust/.test(text)) return nozzleSpec();
  if (/onda|tanque|ripple|água|agua|luz/.test(text)) return tankSpec();
  if (/rel[oó]gio|dial|medidor|ponteiro|metrolog/.test(text)) return dialSpec();
  if (/gota|placa|bit|mem[oó]ria|comput/.test(text)) return plateSpec();
  return benchSpec();
}
