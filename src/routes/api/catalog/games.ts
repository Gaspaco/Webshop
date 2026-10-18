import { sql } from "drizzle-orm";
import { db } from "~/db";
import { CATEGORIES } from "~/lib/categories";

type GameSummaryRow = {
  game: string;
  product_count: number;
  min_price_cents: number | null;
  preview_ids: string[] | null;
};

// One small request for the games index: per game, how many products are
// live, the lowest price, and up to three recent products with artwork.
// Loading the full catalogue just to count it took tens of seconds.
export async function GET() {
  const result = await db.execute<GameSummaryRow>(sql`
    with live as (
      select p.id, p.game, p.created_at,
             jsonb_array_length(p.image_urls) > 0 as has_image,
             min(v.price_cents) as price_cents
      from products p
      join product_variants v on v.product_id = p.id
      where p.status = 'active' and p.game is not null
      group by p.id
    ),
    ranked as (
      select id, game,
             row_number() over (partition by game order by created_at desc) as rank
      from live
      where has_image
    )
    select l.game,
           count(*)::int as product_count,
           min(nullif(l.price_cents, 0))::int as min_price_cents,
           (select array_agg(r.id::text order by r.rank)
              from ranked r
             where r.game = l.game and r.rank <= 3) as preview_ids
    from live l
    group by l.game
  `);

  const rows = (Array.isArray(result) ? result : result.rows) as GameSummaryRow[];
  const games = rows
    .filter(row => CATEGORIES[row.game])
    .map(row => ({
      game: row.game,
      count: row.product_count,
      fromCents: row.min_price_cents,
      previews: (row.preview_ids ?? []).map(
        id => `/api/catalog/image?product=${encodeURIComponent(id)}`,
      ),
    }));

  return Response.json(
    { games },
    { headers: { "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" } },
  );
}
