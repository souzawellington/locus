import type { NotebookCell, Note } from "./types";

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

function at(age: number): { createdAt: number; updatedAt: number } {
  const updatedAt = Date.now() - age;
  return { createdAt: updatedAt - day, updatedAt };
}

export function seedNotes(): Note[] {
  return [
    {
      id: "n-routine",
      title: "Rotina de investigação",
      ...at(8 * minute),
      canvas: { x: 200, y: 640, w: 280, h: 170 },
      body: `Manhã curta, sem dashboard. Abro [[Sincronização local-first]] se o tema é persistência, ou [[Caderno reativo]] se o tema é um número que precisa ser reproduzível. O que for espacial vai para o [[Canvas espacial]]: cartões lado a lado até o argumento caber numa frase.

Dúvida sobre o que eu mesmo escrevi não vai para um chat genérico. Vai para o Atlas, que responde com fragmentos de [[Recuperação no dispositivo]]. Uma fonte de fora — artigo, transcrição, link — passa pela [[Biblioteca dos Profissionais]]: o padrão extract_wisdom devolve uma pré-visualização, e só entra no cofre depois da aprovação. Se a resposta pedir uma ação — criar a nota da revisão semanal, por exemplo — o [[Protocolo MCP]] mostra a ferramenta e espera aprovação.

O encerramento é uma frase no fim desta nota: o que ficou decidido e o que continua aberto. Sem isso, o cofre vira arquivo morto.`,
    },
    {
      id: "n-sync",
      title: "Sincronização local-first",
      ...at(2 * hour),
      canvas: { x: 40, y: 36, w: 280, h: 180 },
      body: `Um cofre sério não pede licença à rede para abrir. A cópia que manda mora no dispositivo. Sincronizar, quando existe, é um passo posterior — não a condição para ler o que você escreveu.

O mecanismo que torna isso possível é o CRDT, um tipo de dado que funde edições concorrentes sem um servidor de desempate. Cada inserção e cada exclusão carrega identidade. Dois aparelhos podem divergir no avião e convergir depois, sem escolher um vencedor à mão.

Nesta arquitetura o documento vivo é um \`Y.Doc\`: a memória acompanha o histórico no nível do caractere. A persistência local espelha esse grafo no armazenamento do navegador, então fechar a aba não apaga o trabalho.

Isto conversa com [[Edição em blocos]], porque um bloco com identidade estável é mais fácil de fundir do que um arquivo opaco, e com [[Privacidade do cofre]], porque o texto não precisa atravessar um banco central para existir.`,
    },
    {
      id: "n-blocks",
      title: "Edição em blocos",
      ...at(5 * hour),
      canvas: { x: 380, y: 24, w: 280, h: 180 },
      body: `Um editor de documento contínuo trata o texto como uma fita. Um editor de blocos trata cada parágrafo, lista, citação ou trecho de código como um nó com identidade própria. Essa identidade é o que permite reordenar, transcluir e indexar um pedaço sem recortar o arquivo inteiro.

A base clássica dessa ideia guarda um modelo transacional do documento, com histórico. Por cima, esquemas descrevem blocos tipados. O markdown continua sendo a forma portátil: o que você lê em outro programa daqui a dez anos não depende de um formato privado.

Reordenar não é enfeite. Quando a unidade de edição é o bloco, mover um argumento para cima muda a estrutura sem corromper o resto. A busca e o Atlas indexam esses mesmos blocos, então a unidade de escrita e a unidade de recuperação coincidem.

Veja também [[Sincronização local-first]] e [[Canvas espacial]].`,
    },
    {
      id: "n-canvas",
      title: "Canvas espacial",
      ...at(9 * hour),
      canvas: { x: 720, y: 80, w: 280, h: 170 },
      body: `No início de uma ideia, a leitura de cima para baixo atrapalha. Um canvas infinito deixa notas, trechos e diagramas ocuparem um plano. A proximidade vira significado: o que está perto foi aproximado de propósito.

Cada cartão é uma nota inteira, não um recado órfão. Mover o cartão não duplica o texto. O corpo continua sendo o mesmo markdown de [[Edição em blocos]], só que visto de cima. As linhas entre cartões são as ligações \`[[wiki]]\`, o mesmo vínculo que o grafo enxerga.

Isso serve para arquiteturas, argumentos e leituras longas. Você espalha as fontes, desenha o fluxo com a posição e só então volta à prosa linear. O canvas é uma vista, não um segundo cofre. O protocolo de ação continua sendo o [[Protocolo MCP]].`,
    },
    {
      id: "n-notebook",
      title: "Caderno reativo",
      ...at(26 * hour),
      canvas: { x: 48, y: 340, w: 290, h: 180 },
      body: `Cadernos no estilo Jupyter escondem estado. A célula de baixo pode depender de uma variável que só existe porque alguém rodou a de cima fora de ordem. Em estudos públicos, mais de um terço dos notebooks no GitHub não volta a executar.

Um caderno reativo troca essa fita por um grafo acíclico. Cada célula declara o que define e o que lê. A ordem de execução sai das dependências, não da posição na tela. Se \`resumo\` usa \`media\` e \`media\` é calculada mais abaixo, o motor resolve a ordem sozinho. Não há variável fantasma de uma corrida anterior: o ambiente é refeito a partir do código visível.

O cálculo roda neste dispositivo, num interpretador pequeno com listas, média, desvio e gráfico. Um CPython completo em WebAssembly caberia no mesmo contrato, isolado para não travar a interface. A regra não muda: célula pura, dependência explícita, resultado reproduzível.

Relacione com [[Rotina de investigação]].`,
    },
    {
      id: "n-rag",
      title: "Recuperação no dispositivo",
      ...at(30 * hour),
      canvas: { x: 390, y: 360, w: 290, h: 190 },
      body: `Perguntar ao próprio arquivo só é aceitável se a resposta apontar para a frase de onde veio. O fluxo é sempre o mesmo: fragmentar o texto, representar cada fragmento, comparar com a pergunta e devolver as passagens — não uma paráfrase solta.

Aqui o índice é local. Cada bloco vira um vetor de n-gramas e o ranking mistura cosseno com BM25. Nada é enviado a uma API. Se a pergunta não encontra apoio, o Atlas diz isso, em vez de completar com conhecimento de fora.

Numa máquina com GPU, o mesmo contrato troca o vetor de n-gramas por um modelo de embeddings quantizado via WebGPU. Há um custo fixo de despacho nessa API, na casa das dezenas de microssegundos por submissão, por isso a fusão de operadores importa. Este cofre não finge que esse modelo está carregado: o que está ligado é o índice que cabe e roda agora.

As citações abrem a nota. Veja [[Privacidade do cofre]] e [[Protocolo MCP]].`,
    },
    {
      id: "n-mcp",
      title: "Protocolo MCP",
      ...at(3 * day),
      canvas: { x: 730, y: 340, w: 280, h: 190 },
      body: `Ter um modelo por perto não integra o dia de trabalho. O Model Context Protocol separa três papéis: o host (este cofre), o cliente que fala JSON-RPC e os servidores de ferramentas. Em vez de um conector artesanal para cada sistema, cada ferramenta declara o que faz.

O ponto que não se negocia é o privilégio mínimo. Toda ferramenta anuncia se é só de leitura ou se escreve. Busca, leitura, grafo e avaliação do caderno rodam direto. Criar nota, acrescentar texto e posicionar no canvas param numa aprovação humana. Você vê o argumento exato antes de qualquer mutação.

Há um precedente concreto de falha: o CVE-2025-53109, no servidor oficial de arquivos, permitia escapar de uma pasta autorizada por meio de links simbólicos e travessia de caminho. Aprovar acesso a um diretório não pode significar aprovar o disco inteiro. Por isso este host não executa ferramentas externas arbitrárias e não escreve fora do cofre local sem um sim explícito.

Ligue isto a [[Recuperação no dispositivo]] e à [[Biblioteca dos Profissionais]]. O padrão extract_wisdom é uma ferramenta de escrita: mostra a nota, os conceitos e os cartões, e espera o mesmo sim.`,
    },
    {
      id: "n-privacy",
      title: "Privacidade do cofre",
      ...at(4 * day),
      canvas: { x: 540, y: 680, w: 280, h: 170 },
      body: `O texto de trabalho, os vetores e o histórico do Atlas ficam no armazenamento local do navegador. Não há conta, não há sincronização na nuvem, e exportar é um arquivo markdown que você baixa de propósito.

Isso tem custo. Trocar de máquina não leva o cofre junto, a menos que você exporte. A troca é deliberada: soberania no dispositivo em vez de um documento que só abre se um serviço consentir.

Ferramentas que escrevem passam por aprovação. Ferramentas que leem mostram a passagem. Nada aqui é um agente com liberdade de disco — o desenho do [[Protocolo MCP]] existe justamente para impedir esse salto.

Se uma frase não está nas notas, [[Recuperação no dispositivo]] não deve inventá-la. A [[Biblioteca dos Profissionais]] pode ler uma fonte que você cola, nunca o cofre inteiro, e mesmo assim só grava com aprovação. A base disso é a [[Sincronização local-first]].`,
    },
    {
      id: "n-library",
      title: "Biblioteca dos Profissionais",
      ...at(6 * hour),
      canvas: { x: 980, y: 200, w: 280, h: 190 },
      body: `A biblioteca não é um segundo cofre. É um conjunto de padrões modulares — extract_wisdom, summarize, extract_insights, extract_recommendations, map_concepts, distill_numbers — para transformar uma fonte de fora em notas deste dispositivo.

O comando leva o nome do padrão e, em seguida, o texto ou o link. Ctrl+K também abre a lista. A saída já nasce em markdown: ideias viram [[ligações]], uma série numérica vira células do [[Caderno reativo]], e duas frentes ou mais ganham a frase de disposição no [[Canvas espacial]].

O que o padrão propõe fica em pré-visualização. Aprovar grava a nota, os conceitos que ainda não existiam e, quando houver, os cartões e as células. Recusar não escreve nada. A busca nas notas continua local. Quando um modelo entra, ele recebe só a fonte colada — não este cofre.

Veja [[Protocolo MCP]] e [[Privacidade do cofre]].`,
    },
  ];
}

export function seedCells(): NotebookCell[] {
  return [
    {
      id: "c-resumo",
      code: 'resumo = "média " + str(round(media, 2)) + " · desvio " + str(round(desvio, 2))\nresumo',
    },
    { id: "c-amostra", code: "amostra = [4, 8, 15, 16, 23, 42]" },
    { id: "c-stats", code: "media = mean(amostra)\ndesvio = std(amostra)" },
    { id: "c-chart", code: "chart(amostra)" },
  ];
}
