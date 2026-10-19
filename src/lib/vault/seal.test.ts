import assert from "node:assert/strict";
import { test } from "node:test";
import { createPinRecord, encryptWithKey, idleExpired, openText, pinMatches, sealText } from "./seal.ts";
import { roundTripMarkdown } from "./blocks.ts";
import { searchNotes } from "./retrieve.ts";

test("a locked note round-trips and a wrong password fails", async () => {
  const secret = "segredo de baunilha e canela";
  const { seal } = await sealText(JSON.stringify({ title: "Bolo", body: secret }), "senha-certa");
  const stored = { id: "n1", title: "Nota trancada", body: "", seal };
  assert.equal(JSON.stringify(stored).includes("baunilha"), false);
  assert.equal(JSON.stringify(stored).includes(secret), false);
  const opened = JSON.parse((await openText(seal, "senha-certa")).plain) as { body: string };
  assert.equal(opened.body, secret);
  await assert.rejects(() => openText(seal, "senha-errada"));
});

test("media sealed with the note key does not keep the plaintext", async () => {
  const secret = "foto-baunilha";
  const { key } = await sealText("nota", "senha-certa");
  const packed = await encryptWithKey(key, JSON.stringify({ mime: "image/jpeg", bytes: secret }));
  const stored = JSON.stringify(packed);
  assert.equal(stored.includes(secret), false);
  const opened = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Uint8Array.from(atob(packed.iv), (char) => char.charCodeAt(0)) },
    key,
    Uint8Array.from(atob(packed.data), (char) => char.charCodeAt(0)),
  );
  assert.equal(JSON.parse(new TextDecoder().decode(opened)).bytes, secret);
});

test("a device pin checks without storing the pin", async () => {
  const record = await createPinRecord("2468");
  assert.equal(JSON.stringify(record).includes("2468"), false);
  assert.equal(await pinMatches(record, "2468"), true);
  assert.equal(await pinMatches(record, "0000"), false);
});

test("a locked note is absent from search until the text is present again", () => {
  const locked = {
    id: "n-locked",
    title: "Nota trancada",
    body: "",
    createdAt: 1,
    updatedAt: 1,
    seal: { salt: "aa", iv: "bb", data: "cc", hideTitle: true, iterations: 1 },
  };
  assert.equal(searchNotes([locked], "baunilha").length, 0);
  assert.equal(searchNotes([{ ...locked, title: "Bolo", body: "" }], "bolo").length, 1);
  assert.equal(searchNotes([{ ...locked, title: "Bolo", body: "baunilha", seal: undefined }], "baunilha").length, 1);
});

test("idle lock fires only after the wait", () => {
  assert.equal(idleExpired(1_000, 1_500, 2_000), false);
  assert.equal(idleExpired(1_000, 3_000, 2_000), true);
});

test("visual blocks round-trip without dropping links, figures or media", () => {
  const source = [
    "Bolo de laranja",
    "",
    "Veja [[Figuras do cofre]] antes do forno.",
    "",
    "![[figure:crdt|sticker|animated|tilt:-3]]",
    "",
    "![[media:foto123|laranja]]",
    "",
    "- [ ] farinha",
    "- [x] ovos",
    "",
    "> um trecho",
    "",
    "---",
  ].join("\n");
  const once = roundTripMarkdown(source);
  assert.equal(roundTripMarkdown(once), once);
  assert.match(once, /\[\[Figuras do cofre\]\]/);
  assert.match(once, /!\[\[figure:crdt\|sticker\|animated\|tilt:-3\]\]/);
  assert.match(once, /!\[\[media:foto123\|laranja\]\]/);
  assert.match(once, /- \[x\] ovos/);
  assert.doesNotMatch(once, /<script/);
});
