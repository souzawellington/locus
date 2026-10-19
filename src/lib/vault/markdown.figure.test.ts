import assert from "node:assert/strict";
import { test } from "node:test";
import { formatFigureEmbed, parseBlocks, parseFigureEmbed, plainText, rewriteWikilinks, wikilinkTitles } from "./markdown.ts";

test("parseFigureEmbed keeps phase 1 lines and reads sticker options", () => {
  assert.deepEqual(parseFigureEmbed("![[figure:wikilinks]]"), { slug: "wikilinks", size: "full", motion: "animated", tilt: 0 });
  assert.deepEqual(parseFigureEmbed("  ![[figure:local-vault|sticker]]\n"), {
    slug: "local-vault",
    size: "sticker",
    motion: "still",
    tilt: 0,
  });
  assert.equal(parseFigureEmbed("![[figure:atlas|full]]")?.size, "full");
  assert.deepEqual(parseFigureEmbed("![[figure:crdt|sticker|animated]]"), {
    slug: "crdt",
    size: "sticker",
    motion: "animated",
    tilt: 0,
  });
  assert.deepEqual(parseFigureEmbed("![[figure:crdt|animated|sticker|tilt:-3]]"), {
    slug: "crdt",
    size: "sticker",
    motion: "animated",
    tilt: -3,
  });
  assert.equal(parseFigureEmbed("![[figure:approval|still]]")?.motion, "still");
  assert.equal(parseFigureEmbed("[[wikilinks]]"), null);
  assert.equal(parseFigureEmbed("![[figure:Bad Slug]]"), null);
  assert.equal(parseFigureEmbed("![[figure:embeddings|wide]]"), null);
  assert.equal(parseFigureEmbed("![[figure:crdt|sticker|animated|still]]"), null);
  assert.equal(parseFigureEmbed("![[figure:crdt|tilt:13]]"), null);
  assert.equal(parseFigureEmbed("![[figure:crdt|tilt:2.5]]"), null);
});

test("formatFigureEmbed round-trips and keeps the phase 1 string short", () => {
  assert.equal(formatFigureEmbed({ slug: "wikilinks" }), "![[figure:wikilinks]]");
  assert.equal(formatFigureEmbed({ slug: "crdt", size: "sticker", motion: "animated", tilt: -3 }), "![[figure:crdt|sticker|animated|tilt:-3]]");
  const line = formatFigureEmbed({ slug: "notebook", size: "sticker" });
  assert.deepEqual(parseFigureEmbed(line), { slug: "notebook", size: "sticker", motion: "still", tilt: 0 });
});

test("a figure line is its own block and is not a wikilink", () => {
  const markdown = "Antes.\n![[figure:notebook]]\nDepois, ver [[Caderno reativo]].";
  const blocks = parseBlocks(markdown);
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["paragraph", "figure", "paragraph"],
  );
  assert.equal(parseFigureEmbed(blocks[1]?.raw ?? "")?.slug, "notebook");
  assert.deepEqual(wikilinkTitles(markdown), ["Caderno reativo"]);
});

test("renames leave figure embeds alone", () => {
  const markdown = "![[figure:canvas|sticker]]\n\nVer [[Canvas espacial]].";
  const renamed = rewriteWikilinks(markdown, "Canvas espacial", "Mesa");
  assert.match(renamed, /!\[\[figure:canvas\|sticker\]\]/);
  assert.match(renamed, /\[\[Mesa\]\]/);
  assert.equal(plainText(markdown).includes("figure:canvas"), false);
});
