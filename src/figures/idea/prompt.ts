export const IDEA_SYSTEM = `Você desenha uma única máquina isométrica para o Locus, um cofre de notas local. O objeto é a explicação: o leitor entende a ideia porque reconhece o mecanismo. Não desenhe caixas com setas nem um diagrama. Invente um instrumento, uma prensa, um cofre, um relógio, uma bancada.

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

export function ideaUserMessage(description: string, previous: string | null, note: string): string {
  const ask = description.trim().slice(0, 2000);
  if (!previous) return `Desenhe a máquina para esta ideia:\n${ask}`;
  return `A figura anterior foi:\n${previous.slice(0, 8000)}\n\nAjuste pedido:\n${note.trim().slice(0, 1000) || "Torne o mecanismo mais claro."}\n\nIdeia original:\n${ask}\n\nDevolva a figura inteira de novo, no mesmo JSON.`;
}
