import { sql, type SQL } from "drizzle-orm";
import { db } from "~/db";
import { CATEGORIES } from "~/lib/categories";

type SearchRow = {
  id: string;
  slug: string;
  name: string;
  game: string | null;
  set_name: string | null;
  set_code: string | null;
  card_number: string | null;
  has_image: boolean;
  price_cents: number | null;
  in_stock: boolean;
};

export type SearchResult = {
  id: string;
  name: string;
  href: string;
  set: string | null;
  number: string | null;
  game: string | null;
  image: string | null;
  priceCents: number | null;
  inStock: boolean;
};

// Treat user (or OCR) text as plain text, never as LIKE wildcards.
export function likeEscape(value: string) {
  return value.replace(/[\\%_]/g, character => `\\${character}`);
}

type SearchInput = {
  /** Free text matched against name, set, set code and card number. */
  text?: string;
  /** Lines read from a card photo, best first; matched against the name. */
  nameLines?: string[];
  /** Distinctive words read from a card photo; more matches rank higher. */
  words?: string[];
  /** Set codes such as "26LP-EN001", matched exactly. */
  codes?: string[];
  /** Collector numbers such as "039", matched exactly. */
  numbers?: string[];
  limit?: number;
};

export async function searchCatalog(input: SearchInput): Promise<SearchResult[]> {
  const conditions: SQL[] = [];
  const ranks: SQL[] = [];

  if (input.text) {
    const contains = `%${likeEscape(input.text)}%`;
    const prefix = `${likeEscape(input.text)}%`;
    conditions.push(sql`(
      p.name ilike ${contains}
      or p.metadata->>'set' ilike ${contains}
      or p.metadata->>'setCode' ilike ${contains}
      or p.metadata->>'cardNumber' ilike ${contains}
    )`);
    ranks.push(sql`(p.name ilike ${prefix}) desc`, sql`(p.name ilike ${contains}) desc`);
  }

  for (const code of input.codes ?? []) {
    conditions.push(sql`upper(p.metadata->>'setCode') = ${code.toUpperCase()}`);
    ranks.push(sql`(upper(p.metadata->>'setCode') = ${code.toUpperCase()}) desc`);
  }

  if (input.numbers?.length) {
    const numberMatch = sql.join(
      input.numbers.map(number => sql`ltrim(p.metadata->>'cardNumber', '0') = ${number.replace(/^0+/, "")}`),
      sql` or `,
    );
    // A number alone matches too much; only use it together with a name.
    ranks.push(sql`(${numberMatch}) desc`);
  }

  if (input.words?.length) {
    const hits = input.words.map(word => sql`(p.name ilike ${`%${likeEscape(word)}%`})`);
    // The card's name is printed first: a product must contain one of the
    // first two words. Later words (attacks, flavour text) only rank, so an
    // unstocked card doesn't pull in products that merely share "Fire".
    conditions.push(sql`(${sql.join(hits.slice(0, 2), sql` or `)})`);
    ranks.push(sql`(${sql.join(hits.map(hit => sql`${hit}::int`), sql` + `)}) desc`);
  }

  (input.nameLines ?? []).forEach(line => {
    const exact = likeEscape(line);
    conditions.push(sql`p.name ilike ${exact}`);
    ranks.push(sql`(p.name ilike ${exact}) desc`);
  });

  if (!conditions.length) return [];

  const result = await db.execute<SearchRow>(sql`
    select p.id, p.slug, p.name, p.game,
           p.metadata->>'set' as set_name,
           p.metadata->>'setCode' as set_code,
           p.metadata->>'cardNumber' as card_number,
           jsonb_array_length(p.image_urls) > 0 as has_image,
           min(v.price_cents) as price_cents,
           bool_or(v.stock > v.reserved_stock) as in_stock
    from products p
    join product_variants v on v.product_id = p.id
    where p.status = 'active' and (${sql.join(conditions, sql` or `)})
    group by p.id
    order by ${sql.join([...ranks, sql`bool_or(v.stock > v.reserved_stock) desc`, sql`p.created_at desc`], sql`, `)}
    limit ${Math.min(Math.max(input.limit ?? 6, 1), 12)}
  `);

  const rows = (Array.isArray(result) ? result : result.rows) as SearchRow[];
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    href: `/products/${row.slug}`,
    set: row.set_name,
    number: [row.set_code, row.card_number].filter(Boolean).join(" ") || null,
    game: row.game ? CATEGORIES[row.game]?.name ?? null : null,
    image: row.has_image ? `/api/catalog/image?product=${encodeURIComponent(row.id)}` : null,
    priceCents: row.price_cents,
    inStock: row.in_stock,
  }));
}
