import { sql } from "drizzle-orm";
import { db } from "~/db";

type BudgetRow = {
  band: "under25" | "25to100" | "over100";
  product_count: number;
  min_price_cents: number | null;
  preview_ids: string[] | null;
};

// Counts for the homepage's "Shop by budget" tiles across the whole live
// catalogue. A product's price is its default variant's, the same price the
// shop's price filter uses, so a tile's count matches the page it opens.
export async function GET() {
  const result = await db.execute<BudgetRow>(sql`
    with priced as (
      select p.id, p.created_at,
             jsonb_array_length(p.image_urls) > 0 as has_image,
             (array_agg(v.price_cents order by v.is_default desc, v.created_at asc))[1] as price_cents,
             bool_or(v.stock > v.reserved_stock) as in_stock
      from products p
      join product_variants v on v.product_id = p.id
      where p.status = 'active'
      group by p.id
    ),
    banded as (
      select *,
             case when price_cents < 2500 then 'under25'
                  when price_cents < 10000 then '25to100'
                  else 'over100' end as band
      from priced
      where in_stock and price_cents > 0
    )
    select band,
           count(*)::int as product_count,
           min(price_cents)::int as min_price_cents,
           (array_agg(id::text order by created_at desc) filter (where has_image))[1:3] as preview_ids
    from banded
    group by band
  `);

  const rows = (Array.isArray(result) ? result : result.rows) as BudgetRow[];
  return Response.json(
    {
      budgets: rows.map(row => ({
        band: row.band,
        count: row.product_count,
        fromCents: row.min_price_cents,
        previews: (row.preview_ids ?? []).map(
          id => `/api/catalog/image?product=${encodeURIComponent(id)}`,
        ),
      })),
    },
    { headers: { "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" } },
  );
}
