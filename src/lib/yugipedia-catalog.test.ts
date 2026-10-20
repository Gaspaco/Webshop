import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isYugipediaImageUrl, parseCardPrintings, parseSetList, parseWikiCard, plainWiki, wikiFields } from "./yugipedia-catalog";

describe("Yugipedia reference parsing", () => {
  it("reads multiline fields without splitting wiki links or nested template pipes", () => {
    const fields = wikiFields("{{CardTable2\n| text = A [[Spellcaster|wizard]] with {{Ruby|test|text}}.\n| password = 12345678\n}}");
    assert.ok(fields.text?.includes("Spellcaster|wizard"));
    assert.equal(fields.password, "12345678");
    assert.equal(plainWiki("''A [[Spellcaster|wizard]]''<ref>note</ref>"), "A wizard");
  });
  it("expands set rarities and honours each block's default rarity", () => {
    const rows = parseSetList("{{Set list|region=EN|rarities=Common|\nCORI-EN001; Black Chaos; Secret Rare, Starlight Rare\nCORI-EN002; Test Card\n}}\n{{Set list|rarities=Super Rare|\nTKN5-EN047; Token (Yugi)\n}}", "Chaos Origins");
    assert.deepEqual(rows.map(row => row.rarity), ["Secret Rare", "Starlight Rare", "Common", "Super Rare"]);
    assert.ok(rows.every(row => row.setName === "Chaos Origins"));
  });
  it("keeps non-English printing codes separate and does not invent prices or passwords", () => {
    const text = "{{CardTable2\n| types = Spellcaster / Effect\n| image = TestCard-CORI-EN-SR-1E.png\n| text = A test card.\n| en_sets =\nCORI-EN001; Chaos Origins; Super Rare, Starlight Rare\n| de_sets =\nCORI-DE001; Chaos Origins; Super Rare\n}}";
    const card = parseWikiCard({ pageid: 123, title: "Test Card", revisions: [{ content: text }] });
    assert.equal(card?.password, null);
    assert.equal(card?.printings.length, 2);
    assert.ok(parseCardPrintings(text).every(row => row.setCode.includes("-EN")));
    assert.equal(parseWikiCard({ pageid: 124, title: "Test anime", revisions: [{ content: "{{CardTable2\n| medium = anime\n}}" }] }), null);
    assert.equal(parseWikiCard({ pageid: 125, title: "Booster box", revisions: [{ content: "{{SetTable\n| name = Box\n}}" }] }), null);
  });
  it("only permits known HTTPS image hosts", () => {
    assert.ok(isYugipediaImageUrl("https://ms.yugipedia.com/1/12/Card.png"));
    for (const value of ["http://yugipedia.com/x", "https://yugipedia.com.evil.test/x", "https://evil.yugipedia.com/x", "https://user:pass@yugipedia.com/x", "http://127.0.0.1/x"]) assert.equal(isYugipediaImageUrl(value), false);
  });
});
