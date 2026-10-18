import { describe, expect, test } from "bun:test";
import { readCardText } from "./card-text";

describe("readCardText", () => {
  test("reads a Yu-Gi-Oh! name and set code", () => {
    const read = readCardText("Monster Reborn\n[SPELL CARD]\nTarget 1 monster in either GY; Special Summon it.\n26LP-EN001\n83764719");
    expect(read.nameLines[0]).toBe("Monster Reborn");
    expect(read.codes).toContain("26LP-EN001");
  });

  test("reads a Pokémon name and collector number", () => {
    const read = readCardText("BASIC\nPikachu\nHP 60\nThunder Shock 20\n039/203\nIllus. Mitsuhiro Arita");
    expect(read.nameLines).toContain("Pikachu");
    expect(read.numbers).toContain("039");
  });

  test("ignores lines that are mostly numbers or symbols", () => {
    const read = readCardText("ATK/2500 DEF/2100\n120 HP\n★★★★");
    expect(read.nameLines).toHaveLength(0);
  });

  test("keeps distinctive words and splits suffixes", () => {
    const read = readCardText("BASIC CharizardV\nHP 220\nFire Energy attack");
    expect(read.words).toContain("Charizard");
    expect(read.words).not.toContain("BASIC");
    expect(read.words).not.toContain("Energy");
  });

  test("caps how much it extracts from long text", () => {
    const text = Array.from({ length: 20 }, (_, i) => `Line number words ${i}\nABC-EN${String(i).padStart(3, "0")}`).join("\n");
    const read = readCardText(text);
    expect(read.nameLines.length).toBeLessThanOrEqual(4);
    expect(read.codes.length).toBeLessThanOrEqual(4);
  });
});
