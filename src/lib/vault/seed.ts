import type { NotebookCell, Note } from "./types";

const minute = 60_000;
const hour = 60 * minute;

function at(age: number): { createdAt: number; updatedAt: number } {
  const updatedAt = Date.now() - age;
  return { createdAt: updatedAt - 24 * hour, updatedAt };
}

export function seedNotes(): Note[] {
  return [
    {
      id: "n-today",
      title: "Hoje",
      ...at(2 * minute),
      color: "white",
      font: "newsreader",
      body: "",
    },
    {
      id: "n-how",
      title: "Como usar",
      ...at(10 * minute),
      color: "sand",
      font: "plex",
      canvas: { x: 48, y: 280, w: 300, h: 170 },
      body: `Um caderno. Clique e escreva.

A lista à esquerda guarda as notas. A busca é instantânea. \`/\` abre um bloco. \`@\` liga outra nota.

O [[Canvas]] espalha as notas no espaço. O [[Caderno]] faz contas que se atualizam sozinhas. O [[Grafo]] mostra as ligações escritas assim: [[Hoje]].

O Atlas responde com o que você já anotou e diz quando não sabe. A Biblioteca — extract_wisdom, summarize, extract_insights, extract_recommendations, map_concepts, distill_numbers — lê só a fonte colada e mostra uma prévia. Só entra no caderno se você aprovar.

A caneta desenha nesta página. A cor e a fonte são desta nota. Exportar pede aprovação e entrega markdown, HTML, JSON, texto e SVG.

Trancar nota esconde o texto até você abrir. O Mapa junta os lugares das notas abertas. Uma figura entra pelo menu \`/\`.`,
    },
    {
      id: "n-canvas",
      title: "Canvas",
      ...at(2 * hour),
      color: "sky",
      font: "plex",
      canvas: { x: 80, y: 40, w: 280, h: 160 },
      body: `O mesmo texto, visto de cima. Arraste os cartões. A proximidade é o argumento.

Volte para [[Hoje]] quando a frase estiver pronta.`,
    },
    {
      id: "n-notebook",
      title: "Caderno",
      ...at(5 * hour),
      color: "leaf",
      font: "plex-mono",
      canvas: { x: 420, y: 48, w: 280, h: 160 },
      body: `Células que se recalculam pela dependência, não pela ordem na página. A amostra de exemplo já está no caderno.

Relacione com [[Como usar]].`,
    },
    {
      id: "n-graph",
      title: "Grafo",
      ...at(8 * hour),
      color: "lilac",
      font: "plex",
      body: `Cada ligação vira uma linha. Só aparecem notas que existem.

Veja [[Como usar]] e [[Hoje]].`,
    },
  ];
}

export function seedCells(): NotebookCell[] {
  return [
    { id: "c-amostra", code: "amostra = [4, 8, 15, 16, 23, 42]" },
    { id: "c-media", code: "media = mean(amostra)\ndesvio = std(amostra)" },
    {
      id: "c-resumo",
      code: 'resumo = "média " + str(round(media, 2)) + " · desvio " + str(round(desvio, 2))',
    },
    { id: "c-chart", code: "chart(amostra)" },
  ];
}
