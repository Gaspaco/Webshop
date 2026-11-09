# Bulk import libraries

Use **Bulk import → Choose a game or import source**. Only that library is shown, without scrolling past other games. Switching libraries preserves their current searches. **Inventory files** remains a separate area for CSV templates and exports.

## Yu-Gi-Oh updates

Use **Bulk import → Yu-Gi-Oh → Check for new sets** to see English TCG set lists recently changed on Yugipedia. Choose **Load [set name]** to refresh that set into the reference library, then select cards to import as zero-stock private drafts. This does not change published products, prices or inventory. You can also enter any full set name and use **Refresh from Yugipedia**.

Discovery makes one bounded request for up to 500 recent changes, shows up to 20 unique English sets and caches the suggestions for one hour across all admins. Recent edits are not release-date order and this is not a complete upcoming-release calendar. Checks require admin access and are limited to once per minute per admin; all Yugipedia requests share the existing one-request-per-second gate and provider cooldowns. There is no unattended crawl or automatic publishing.

Command line: `bun run db:sync:yugioh --recent-sets`, then `bun run db:sync:yugioh --set="Full Set Name" --refresh`. The script needs the database environment loaded by your runtime. A provider access error must be resolved with Yugipedia, not by repeatedly retrying.

## Other integrations

| Source | Configuration | Imported data |
| --- | --- | --- |
| [OPTCG API](https://optcgapi.com/documentation) | No key | One Piece booster sets, starter decks and promotional cards; distinct parallel-art references |
| [Grand Archive](https://api-docs.gatcg.com/) | No key | Matching editions, sets, rarity labels, available foil/non-foil circulations and supplied stamped-variant images |
| [PokéWallet Vanguard](https://pokewallet.io/api-docs/cardfight-vanguard) | `POKEWALLET_API_KEY` | Card and set searches, unique set IDs, finish variants, Cardmarket EUR references and authenticated artwork |
| [Channel3](https://docs.trychannel3.com/api-reference) | `CHANNEL3_API_KEY` | Product-search references for figures/Funko Pops, collectibles/Beyblades, plush merchandise and manually classified trading cards |

Set keys directly in the server environment, locally and in the deployment platform. They are not browser variables. No new keys have been added by this change. PokéWallet requires an account/key even for its free data endpoints. Its premium analytics endpoints are not used. Channel3 account access, billing and category coverage must be checked with the owner's account; a catalog result is not wholesale access or a guarantee that any specific item exists in the index.

All imports are private drafts with zero physical stock. Existing imports are not overwritten. Unknown or USD references do not become EUR selling prices. Channel3 retailer prices and availability are informational only; its imports always start with a zero selling price. The owner must review the exact item/printing, upload stock, set prices and publish. Channel3 imports also require explicit confirmation that the owner sells the item and has permission to reuse the supplied data/media. Do not assume that the API grants unrestricted image rights.

Channel3's advertised option lists are not expanded into every possible colour/size combination. Only the resolved configuration is imported, avoiding invented variants and stock. Use the normal variation editor for additional verified options.

Vanguard artwork is downloaded on import, resized to bounded WebP and stored locally as an upload. Searching does not spend image calls. API keys are never placed in image URLs. One Piece and Grand Archive retain their exact source URLs, supported by the SKU image cache. Unknown merchandise image hosts retain the existing safe image fallback; they are not added to an unrestricted server-side downloader.

## Request protection

Provider requests are server-side, HTTPS-only and limited to fixed hosts. Redirects are rejected. Timeouts, response-size limits, shared PostgreSQL leases, request budgets and Retry-After handling bound provider usage. JSON search responses are cached for a day, selected normalized references for 30 days. Paginated libraries expose **Load more results**, rather than silently dropping later results or fetching every page automatically. The legacy `yugipedia_cache` table is reused with a separate `reference-v1:` namespace; no new schema migration is needed for these providers.

Application budgets are deliberately below PokéWallet's documented free limits: 80 uncached requests/hour and 800/day, shared by Vanguard search and artwork. Other new providers have a conservative 100/hour and 500/day ceiling. Shared account usage outside this app can still consume the provider's quota. Cached lookups remain available after the app budget is exhausted. No scheduled full-catalogue refresh is introduced.

## Expansion sets and variations

The shop has an always-visible **Set / expansion** control. The catalogue dashboard and game shop also have set selectors. Choices are separated by game. Published zero-stock products still count; private API-library drafts do not appear publicly until published.

Set filters and the game's **Sets** page share the same lookup. It reads product set metadata, structured variant printing sets, and older known Yu-Gi-Oh!/Magic/Digimon variant-name formats. Code-only products also get a set entry. Each product is counted once in each matching set. Set-specific grids choose a preview from that set's variations and link to the corresponding variant on the detail page.

New variation printing fields are `attributes.setName` and `attributes.setCode`, also included as `variant_setName` and `variant_setCode` in TCG CSV layouts. New Yu-Gi-Oh!/Magic imports populate them; old listings work through the restricted compatibility reader without rewriting production data. The preceding product-workflow migration `0021_product_variant_attributes` must be applied before deploying this accumulated workspace.

## Verification

Provider parsers, image/price identity, pagination and cache reuse, authorization, cross-origin rejection, quota behavior, authenticated image normalization, idempotent imports and set grouping are covered by isolated PostgreSQL tests. Public One Piece and Grand Archive response formats were checked with small read-only requests. Vanguard and Channel3 require real account keys for live end-to-end verification. Visual browser verification is not available in this tool session.
