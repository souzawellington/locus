export const IDEA_SYSTEM = `Você desenha uma única máquina isométrica para o Locus, um caderno de notas local. O objeto é a explicação: o leitor entende a ideia porque reconhece o mecanismo. Não desenhe caixas com setas nem um diagrama. Invente um instrumento, uma prensa, um armário, um relógio, uma bancada.

Devolva só JSON, sem markdown e sem comentário. Não devolva SVG, HTML, URL, cor em hex, script, nem foreignObject. A paleta (papel #F3EFE6, quente #FAF7F1, linha #E2D9C9, mudo #6D655C, tinta #1A1714, cobre #9C4520) é aplicada pelo aplicativo. Você escolhe o tom de cada peça: lo, mid, hi ou faint. Exatamente uma peça tem lit true: é a peça que se observa.

Mundo: x e y no chão da bancada, z para cima. Fique em x de -100 a 100, y de -36 a 36, z de 0 a 56. z é a base da peça. As peças assentam umas nas outras.

kind:
- slab: bloco. x,y é o canto, w largura, d profundidade, h altura, r raio do canto.
- cylinder: x,y é o centro, r o raio, h a altura, z a base.
- screw: um parafuso em x,y,z.

layer "body" fica quieta. layer "moving" anda em x pelo valor slide quando o ciclo vai do repouso ao trabalho, e sobe lift quando a figura é desmontada. Pelo menos uma peça moving tem slide e lift diferentes de zero.

Use 8 a 14 peças: uma base do mecanismo, postes ou guias, a peça que se move, e pelo menos dois parafusos. Textos curtos em português do Brasil, sem marcação.

Forma:
{"name":"ampulheta","title":"Ampulheta","blurb":"A areia muda de vaso.","caption":"Nada sai da bancada.","readRest":"vaso de cima cheio","readMoved":"areia a meio","parts":[{"id":"prato","kind":"slab","x":-18,"y":-14,"z":0,"w":36,"d":28,"h":4,"r":2,"tone":"lo","lit":false,"layer":"body","slide":0,"lift":0}]}`;

export type FigureRac = {
  activeNoteTitle: string;
  activeNoteExcerpt: string;
  linkedNotesSummary: string[];
  preferredTheme: string;
};

const ANATOMY_RULES = `Regras de anatomia da figura:
- Decomponha a máquina em 3 a 12 peças. Cada peça assenta noutra ou fica afastada dela.
- lathe para peças cilíndricas, cônicas, bicos e botões. O eixo é axisOrigin + axisDirection (não assuma o eixo Z). profile tem pelo menos 2 pontos {axial, radius>=0}. segments entre 12 e 96.
- tube para linhas, cabos e mangueiras. waypoints com pelo menos 2 pontos. radius > 0. bendRadius padrão 4, nunca menor que o dobro do raio, com uma curva plausível.
- iso-prism para bases, placas e caixas. center, dimensions [largura, profundidade, altura], chamfer padrão 0.
- Cada peça que se move tem uma joint com eixo unitário: fixed, revolute (graus), prismatic ou exploded-slide (mm). range [min, max]. minClearanceMm >= 1.5 ao longo de t em [0,1].
- Peças de fora usam strokeTier silhouette. O que está cortado usa crease ou section e surfaceTone cutaway.
- Não devolva SVG, HTML, URL, hex, script nem foreignObject. A cor sai dos tokens do caderno.`;

const HUMANIZER_RULES = `Texto em português do Brasil, curto, como quem anota num caderno:
- label tem 2 a 4 palavras técnicas exatas.
- technicalRole é uma frase factual, com unidade real (mm, °, Hz, V).
- Não escreva: "serve como um testamento", "mergulhar fundo", "tapeçaria", "cenário em constante evolução", "não é apenas", "crucial destacar", "sinergia", "revolucionário".
- Não abuse de travessões. Prefira ponto ou uma frase só.
- Não fale de modelo, API, auditoria, segurança ou arquitetura.`;

export function buildFigureCompilationPrompt(userRequest: string, rac: FigureRac): { system: string; user: string } {
  const excerpt = rac.activeNoteExcerpt.replace(/\s+/g, " ").trim().slice(0, 700);
  const linked = rac.linkedNotesSummary
    .slice(0, 4)
    .map((line) => line.replace(/\s+/g, " ").trim().slice(0, 240))
    .filter(Boolean);
  const note = excerpt
    ? `Nota aberta: ${rac.activeNoteTitle.replace(/\s+/g, " ").trim().slice(0, 80)}\n${excerpt}`
    : "Não há trecho de nota para usar.";
  const links = linked.length ? linked.map((line) => `- ${line}`).join("\n") : "- nenhuma";
  return {
    system: `Você descreve uma única máquina isométrica para o Locus, um caderno. O objeto é a explicação. Devolva só JSON do FigureIdeaSpec, sem markdown.

${ANATOMY_RULES}

${HUMANIZER_RULES}

Forma: {"id":"fig-exemplo","title":"Título","subtitle":"Uma frase.","domain":"mechanism","projection":{"type":"isometric","azimuthDeg":45,"elevationDeg":35.264,"scale":1},"defaultParameterT":0.25,"parameterLabel":"curso","parts":[{"id":"base","label":"Base da bancada","technicalRole":"A base mede 80 mm por 40 mm.","strokeTier":"silhouette","surfaceTone":"base","joint":{"type":"fixed","axis":[0,0,1],"origin":[0,0,0],"range":[0,0],"minClearanceMm":1.5},"primitives":[{"kind":"iso-prism","center":[0,0,4],"dimensions":[80,40,8],"chamfer":0}],"calloutAnchor":[0,-24,8]}]}`,
    user: `Pedido:\n${userRequest.replace(/\s+/g, " ").trim().slice(0, 500) || "Uma bancada com uma peça que corre."}\n\n${note}\n\nNotas ligadas, só o resumo:\n${links}\n\nTema já aplicado pelo caderno: ${rac.preferredTheme.slice(0, 32) || "paper"}. Não escolha cores.`,
  };
}

const CLICHES: [RegExp, string][] = [
  [/serve como um testamento/gi, "mostra"],
  [/mergulhar fundo/gi, "olhar de perto"],
  [/tapeçaria/gi, "trama"],
  [/cenário em constante evolução/gi, "o que muda"],
  [/não é apenas/gi, "é"],
  [/crucial destacar/gi, "anotar"],
  [/\bsinergia\b/gi, "encaixe"],
  [/\brevolucionário\b/gi, "novo"],
  [/\brevolucionaria\b/gi, "nova"],
];

function calmCopy(text: string): string {
  let next = text.replace(/[<>]/g, "");
  for (const [pattern, replacement] of CLICHES) next = next.replace(pattern, replacement);
  const dashes = next.match(/—/g);
  if (dashes && dashes.length > 1) {
    let seen = 0;
    next = next.replace(/—/g, (token) => {
      seen += 1;
      return seen === 1 ? token : ",";
    });
  }
  return next.replace(/[ \t]{2,}/g, " ").trim();
}

function firstSentence(text: string): string {
  const match = /^.*?[.!?](?=\s|$)/.exec(text);
  return (match ? match[0] : text).trim();
}

function tidyLabel(label: string): string {
  const clean = calmCopy(label);
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= 4) return clean;
  return words.slice(0, 4).join(" ");
}

export function sanitizeFigureCopyWithHumanizer<
  T extends { title: string; subtitle: string; parameterLabel: string; parts: { label: string; technicalRole: string }[] },
>(spec: T): T {
  return {
    ...spec,
    title: calmCopy(spec.title).slice(0, 60),
    subtitle: firstSentence(calmCopy(spec.subtitle)).slice(0, 110),
    parameterLabel: calmCopy(spec.parameterLabel).slice(0, 40),
    parts: spec.parts.map((part) => ({
      ...part,
      label: tidyLabel(part.label).slice(0, 42),
      technicalRole: firstSentence(calmCopy(part.technicalRole)).slice(0, 140),
    })),
  };
}

export function ideaUserMessage(description: string, previous: string | null, note: string): string {
  const ask = description.trim().slice(0, 2000);
  if (!previous) return `Desenhe a máquina para esta ideia:\n${ask}`;
  return `A figura anterior foi:\n${previous.slice(0, 8000)}\n\nAjuste pedido:\n${note.trim().slice(0, 1000) || "Torne o mecanismo mais claro."}\n\nIdeia original:\n${ask}\n\nDevolva a figura inteira de novo, no mesmo JSON.`;
}
