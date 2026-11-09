import assert from "node:assert/strict";
import { it } from "node:test";
import { recentEnglishSets } from "./yugipedia-sets";

it("recent sets keep only English TCG lists, deduplicate and sort by activity", () => {
  assert.deepEqual(recentEnglishSets([
    { title: "Set Card Lists:Old Set (TCG-EN)", timestamp: "2026-11-01T00:00:00Z" },
    { title: "Set Card Lists:New Set (TCG-EN)", timestamp: "2026-11-07T00:00:00Z" },
    { title: "Set Card Lists:Old Set (TCG-EN)", timestamp: "2026-11-05T00:00:00Z" },
    { title: "Set Card Lists:German Set (TCG-DE)", timestamp: "2026-11-08T00:00:00Z" },
    { title: "Set Card Galleries:Other (TCG-EN)", timestamp: "2026-11-08T00:00:00Z" },
    { title: "Set Card Lists:Bad|title (TCG-EN)", timestamp: "2026-11-08T00:00:00Z" },
    { title: "Set Card Lists:Invalid date (TCG-EN)", timestamp: "invalid" },
  ]), [
    { name: "New Set", updatedAt: "2026-11-07T00:00:00Z" },
    { name: "Old Set", updatedAt: "2026-11-05T00:00:00Z" },
  ]);
});

it("recent set suggestions are bounded and empty feeds are safe", () => {
  assert.deepEqual(recentEnglishSets([]), []);
  assert.equal(recentEnglishSets(Array.from({ length: 500 }, (_, i) => ({
    title: `Set Card Lists:Set ${i} (TCG-EN)`, timestamp: "2026-11-08T00:00:00Z",
  }))).length, 20);
});
