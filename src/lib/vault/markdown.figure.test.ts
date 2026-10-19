import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBlocks, parseFigureEmbed, plainText, rewriteWikilinks, wikilinkTitles } from "./markdown.ts";

test("parseFigureEmbed reads slug and size", () => {
  assert.deepEqual(parseFigureEmbed("![[figure:wikilinks]]"), { slug: "wikilinks", size: "full" });
  assert.deepEqual(parseFigureEmbed("  ![[figure:local-vault|sticker]]\n"), { slug: "local-vault", size: "sticker" });
  assert.equal(parseFigureEmbed("![[figure:atlas|full]]")?.size, "full");
  assert.equal(parseFigureEmbed("[[wikilinks]]"), null);
  assert.equal(parseFigureEmbed("![[figure:Bad Slug]]"), null);
  assert.equal(parseFigureEmbed("![[figure:embeddings|wide]]"), null);
});

test("a figure line is its own block and is not a wikilink", () => {
  const markdown = "Antes.\n![[figure:notebook]]\nDepois, ver [[Caderno reativo]].";
  const blocks = parseBlocks(markdown);
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["paragraph", "figure", "paragraph"],
  );
  assert.deepEqual(parseFigureEmbed(blocks[1]?.raw ?? ""), { slug: "notebook", size: "full" });
  assert.deepEqual(wikilinkTitles(markdown), ["Caderno reativo"]);
});

test("renames leave figure embeds alone", () => {
  const markdown = "![[figure:canvas|sticker]]\n\nVer [[Canvas espacial]].";
  const renamed = rewriteWikilinks(markdown, "Canvas espacial", "Mesa");
  assert.match(renamed, /!\[\[figure:canvas\|sticker\]\]/);
  assert.match(renamed, /\[\[Mesa\]\]/);
  assert.equal(plainText(markdown).includes("figure:canvas"), false);
});
