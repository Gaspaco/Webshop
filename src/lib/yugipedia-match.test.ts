import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isExactCardImageFile,
  matchYugipediaPrintingFile,
  parseInfoboxImageFileNames,
  yugipediaCardFilePrefix,
} from "./yugipedia-match";

describe("Yugipedia printing image matching", () => {
  it("parses both single and numbered infobox image syntax", () => {
    assert.deepEqual(
      parseInfoboxImageFileNames("| image = Card-POTE-EN-ScR-1E.png\n| attribute = LIGHT"),
      ["Card-POTE-EN-ScR-1E.png"],
    );
    assert.deepEqual(
      parseInfoboxImageFileNames("| image =\n1; Card-LOB-EN-C-1E.png\n2; Card-LOB-EN-R-UE.png\n| attribute = DARK"),
      ["Card-LOB-EN-C-1E.png", "Card-LOB-EN-R-UE.png"],
    );
  });

  it("uses the exact card filename prefix", () => {
    assert.equal(yugipediaCardFilePrefix("D.D. Crow"), "DDCrow");
    assert.equal(isExactCardImageFile("Dark Magician", "DarkMagician-LOB-EN-UR-1E.png"), true);
    assert.equal(isExactCardImageFile("Dark Magician", "DarkMagicianGirl-MFC-EN-SCR-1E.png"), false);
  });

  it("matches the API rarity code instead of the loose word rare", () => {
    const files = [
      "CardName-PGLD-EN-R-1E.png",
      "CardName-PGLD-EN-GUR-1E.png",
      "CardName-PGLD-EN-GSCR-1E.png",
    ];
    assert.equal(
      matchYugipediaPrintingFile({
        cardName: "Card Name",
        setCode: "PGLD-EN001",
        rarity: "Gold Rare",
        rarityCode: "(GUR)",
      }, files),
      "CardName-PGLD-EN-GUR-1E.png",
    );
  });

  it("does not guess when the requested rarity is unavailable", () => {
    assert.equal(matchYugipediaPrintingFile({
      cardName: "Card Name",
      setCode: "POTE-EN001",
      rarity: "Starlight Rare",
      rarityCode: "(StR)",
    }, ["CardName-POTE-EN-ScR-1E.png"]), null);
  });
});
