// Words printed on most cards that never identify one.
const BOILERPLATE = new Set([
  "stage", "basic", "evolves", "from", "pokemon", "pokémon", "trainer", "energy", "item",
  "supporter", "stadium", "tool", "weakness", "resistance", "retreat", "illus", "ability",
  "attack", "damage", "your", "this", "that", "with", "when", "each", "card", "cards",
  "opponent", "opponents", "active", "bench", "benched", "turn", "during", "rule", "prize",
  "prizes", "spell", "trap", "effect", "normal", "continuous", "quick", "play", "field",
  "nintendo", "creatures", "game", "freak", "konami", "wizards", "coast", "inc", "ltd",
  "edition", "limited", "first", "1st", "the", "and", "for", "you", "can", "may", "its",
]);

// "CharizardV" -> "Charizard V", "PikachuVMAX" -> "Pikachu VMAX".
function splitSuffixes(line: string) {
  return line.replace(/([a-z])(VMAX|VSTAR|V|EX|GX|ex)\b/g, "$1 $2");
}

// Pull the useful bits out of the card's printed text.
export function readCardText(text: string) {
  const lines = text
    .split("\n")
    .map(line => splitSuffixes(line.trim()))
    .filter(line => line.length >= 3 && line.length <= 48)
    // Skip lines that are mostly numbers or symbols (HP, ATK/DEF, rules text).
    .filter(line => (line.match(/[a-zà-ÿ]/gi)?.length ?? 0) >= line.length * 0.6);

  // Distinctive words, in reading order: the name is usually near the top.
  const words: string[] = [];
  for (const line of lines.slice(0, 10)) {
    for (const raw of line.split(/[^a-zà-ÿ0-9'-]+/i)) {
      const word = raw.replace(/^['-]+|['-]+$/g, "");
      if (word.length < 4 || /\d/.test(word) || BOILERPLATE.has(word.toLowerCase())) continue;
      if (!words.some(existing => existing.toLowerCase() === word.toLowerCase())) words.push(word);
    }
  }

  const upper = text.toUpperCase();
  // Yu-Gi-Oh! style set codes: 26LP-EN001, LOB-EN005, MP24-EN123.
  const codes = [...new Set(upper.match(/\b[A-Z0-9]{2,5}-[A-Z]{0,2}\d{2,4}\b/g) ?? [])].slice(0, 4);
  // Pokémon style collector numbers: 039/203 -> 039.
  const numbers = [...new Set([...upper.matchAll(/\b(\d{1,3})\s*\/\s*\d{1,3}\b/g)].map(match => match[1]))].slice(0, 4);

  return { nameLines: lines.slice(0, 4), words: words.slice(0, 6), codes, numbers };
}
