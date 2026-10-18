// Release notes shown once to returning visitors after an update.
// To announce a new update: add an entry at the top with a new `version`.
export type PatchNote = {
  version: string;
  date: string;
  title: string;
  items: string[];
  link?: { href: string; label: string };
};

export const PATCH_NOTES: PatchNote[] = [
  {
    version: "2026.10.1",
    date: "October 2026",
    title: "A fresh new look",
    items: [
      "Redesigned shop, product pages and checkout",
      "Search now suggests cards as you type",
      "Find a card by photo: drop or paste a screenshot into the scan button next to search",
      "Shop by budget on the homepage",
    ],
    link: { href: "/products", label: "Browse the shop" },
  },
];

export const LATEST_PATCH = PATCH_NOTES[0];
