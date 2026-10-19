import { parseBlocks, plainText } from "./markdown";
import type { Citation, Note } from "./types";

const DIM = 64;

const STOP = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "a",
  "o",
  "e",
  "em",
  "um",
  "uma",
  "para",
  "com",
  "que",
  "se",
  "os",
  "as",
  "na",
  "no",
  "nos",
  "nas",
  "por",
  "como",
  "mais",
  "nao",
  "ao",
  "ou",
  "seu",
  "sua",
  "seus",
  "suas",
  "isso",
  "isto",
  "essa",
  "esse",
  "ser",
  "foi",
  "sao",
  "tem",
  "ha",
  "ja",
  "voce",
  "the",
  "and",
  "of",
]);

export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function tokens(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP.has(token));
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function embed(text: string): Float32Array {
  const vector = new Float32Array(DIM);
  const words = tokens(text);
  const add = (token: string, weight: number) => {
    const hashed = hash(token);
    vector[hashed % DIM] += weight;
    const sign = (hashed >>> 16) & 1 ? 1 : -1;
    vector[(hashed >>> 8) % DIM] += sign * weight * 0.5;
  };
  for (const word of words) {
    add(word, 1);
    if (word.length >= 4) {
      for (let index = 0; index < word.length - 2; index += 1) add(word.slice(index, index + 3), 0.35);
    }
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let index = 0; index < vector.length; index += 1) vector[index] /= norm;
  return vector;
}

function cosine(a: Float32Array, b: Float32Array): number {
  let total = 0;
  for (let index = 0; index < a.length; index += 1) total += (a[index] ?? 0) * (b[index] ?? 0);
  return total;
}

type Chunk = {
  noteId: string;
  title: string;
  text: string;
  tokens: string[];
  vector: Float32Array;
};

function chunksOf(notes: Note[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (const note of notes) {
    const blocks = parseBlocks(note.body);
    const pieces = blocks.length ? blocks.map((block) => plainText(block.raw)) : [plainText(note.body)];
    for (const piece of pieces) {
      if (piece.length < 24) continue;
      const text = piece.slice(0, 700);
      chunks.push({
        noteId: note.id,
        title: note.title,
        text,
        tokens: tokens(`${note.title} ${text}`),
        vector: embed(`${note.title}. ${text}`),
      });
    }
  }
  return chunks;
}

function bm25(query: string[], chunks: Chunk[]): number[] {
  const total = chunks.length || 1;
  const df = new Map<string, number>();
  const docs = chunks.map((chunk) => {
    const freq = new Map<string, number>();
    for (const token of chunk.tokens) freq.set(token, (freq.get(token) ?? 0) + 1);
    for (const token of freq.keys()) df.set(token, (df.get(token) ?? 0) + 1);
    return { freq, len: chunk.tokens.length || 1 };
  });
  const avg = docs.reduce((sum, doc) => sum + doc.len, 0) / total;
  const k1 = 1.2;
  const b = 0.75;
  return docs.map((doc) => {
    let score = 0;
    for (const token of new Set(query)) {
      const freq = doc.freq.get(token) ?? 0;
      if (!freq) continue;
      const documents = df.get(token) ?? 0;
      const idf = Math.log(1 + (total - documents + 0.5) / (documents + 0.5));
      score += (idf * (freq * (k1 + 1))) / (freq + k1 * (1 - b + (b * doc.len) / avg));
    }
    return score;
  });
}

function bestSentence(text: string, query: string[]): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 30);
  if (!sentences.length) return text.slice(0, 320);
  let best = sentences[0] ?? text;
  let bestScore = -1;
  for (const sentence of sentences) {
    const words = new Set(tokens(sentence));
    let overlap = 0;
    for (const token of query) if (words.has(token)) overlap += 1;
    const score = overlap / Math.sqrt(Math.max(4, words.size));
    if (score > bestScore) {
      bestScore = score;
      best = sentence;
    }
  }
  return best;
}

export function retrieve(query: string, notes: Note[], limit = 3): Citation[] {
  const queryTokens = tokens(query);
  if (!queryTokens.length || !notes.length) return [];
  const chunks = chunksOf(notes);
  if (!chunks.length) return [];
  const queryVector = embed(query);
  const lexical = bm25(queryTokens, chunks);
  const maxLexical = Math.max(...lexical, 0.0001);
  const scored = chunks.map((chunk, index) => {
    const dense = Math.max(0, cosine(queryVector, chunk.vector));
    const sparse = (lexical[index] ?? 0) / maxLexical;
    return {
      chunk,
      score: sparse * 0.58 + dense * 0.42,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0]?.score ?? 0;
  if (top < 0.3) return [];
  const floor = Math.max(0.3, top * 0.58);
  const picked: Citation[] = [];
  const seen = new Set<string>();
  for (const item of scored) {
    if (item.score < floor) break;
    const key = item.chunk.noteId;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push({
      noteId: item.chunk.noteId,
      title: item.chunk.title,
      excerpt: bestSentence(item.chunk.text, queryTokens),
      score: item.score,
    });
    if (picked.length >= limit) break;
  }
  return picked;
}

export function composeAnswer(hits: Citation[]): string {
  if (!hits.length) {
    return "Não encontrei uma passagem no cofre que sustente uma resposta. Nada foi completado com conhecimento de fora das suas notas.";
  }
  const lines = hits.map((hit, index) => `(${index + 1}) ${hit.title} — ${hit.excerpt}`);
  return ["Isto está escrito no cofre. Não saiu do dispositivo e não acrescentei fatos de fora.", "", ...lines].join("\n");
}

export function findNote(notes: Note[], query: string): Note | undefined {
  const needle = fold(query.trim());
  if (!needle) return undefined;
  return notes.find((note) => fold(note.title) === needle);
}

export function findNoteLoose(notes: Note[], query: string): Note | undefined {
  const exact = findNote(notes, query);
  if (exact) return exact;
  const needle = fold(query.trim());
  if (needle.length < 3) return undefined;
  const starts = notes.filter((note) => fold(note.title).startsWith(needle));
  if (starts.length === 1) return starts[0];
  const includes = notes.filter((note) => fold(note.title).includes(needle));
  if (includes.length === 1) return includes[0];
  return undefined;
}

export function searchNotes(notes: Note[], query: string): Note[] {
  const needle = fold(query.trim());
  const ranked = notes.map((note) => {
    if (!needle) return { note, score: note.updatedAt };
    const title = fold(note.title);
    const body = fold(note.body);
    let score = 0;
    if (title.startsWith(needle)) score += 120;
    else if (title.includes(needle)) score += 70;
    const count = body.split(needle).length - 1;
    if (count > 0) score += 15 + Math.min(count, 8);
    return { note, score };
  });
  return ranked
    .filter((item) => (needle ? item.score > 0 : true))
    .sort((a, b) => (needle ? b.score - a.score : b.note.updatedAt - a.note.updatedAt))
    .map((item) => item.note);
}

export function snippet(note: Note, query: string): string {
  const plain = plainText(note.body);
  const needle = fold(query.trim());
  if (!needle) return plain.slice(0, 110);
  const hay = fold(plain);
  const at = hay.indexOf(needle);
  if (at < 0) return plain.slice(0, 110);
  const start = Math.max(0, at - 36);
  const slice = plain.slice(start, start + 120).trim();
  return `${start > 0 ? "…" : ""}${slice}`;
}
