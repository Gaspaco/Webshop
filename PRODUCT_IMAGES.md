# First-party product images

Apply migration `0020_product_image_cache` before deploying the new image routes.
No catalogue entries, original URLs, prices, stock, or customer data are changed.

Product and variant images are exposed as `/product-images/<sku>--<reference>--<version>.webp`.
Unsafe filename characters are replaced, long SKUs are bounded, and the reference
keeps different printings/gallery images distinct. Changing an image source changes
its URL. Changing a SKU changes the filename; stock and price changes do not.

On first view, supported API artwork is downloaded with a bounded stream and
timeout, validated as a raster image, optimized to WebP, and stored in PostgreSQL.
The same source is reused across products, variants, and gallery pictures. Stored
uploads and Yugipedia printing references use this same pipeline. Entire external
card libraries are **not** downloaded: only pictures for published catalogue products.
Original source references remain available privately to the dashboard/import tools.

Storefront image rendering keeps the original product gallery available separately
from the selected variant cover. If a variant photo fails, the shop, quick view and
detail page try that product's saved gallery photos once each, without substituting
another variant's artwork or changing the selected price/stock. Cached images that
loaded (or failed) before hydration are detected without waiting for another load
event. The loading artwork stays behind the photo rather than covering it. Missing
or permanently unavailable source photos still need a replacement upload/URL; the
renderer does not invent product photography or retry providers indefinitely.

The default budget is **256 MiB of stored base64 payload**, with atomic accounting
across instances. This is not a measurement of total PostgreSQL disk usage: indexes,
WAL and backups use additional space. `PRODUCT_IMAGE_CACHE_MAX_MB` may be set to an
integer from `0` to `2048`; check Railway's volume headroom before raising it.
There are at most eight concurrent downloads and 120 new-image operations per minute
across instances. Maximum source size is 8 MB, decoder input is bounded to 20 MP,
and optimized output is at most 1 MB. Existing source/provider rate limits still apply.

Only explicitly reviewed public HTTPS image-provider hosts are fetched. Redirects,
URL credentials, custom ports, SVG/document payloads and oversized downloads are
rejected. Other owner-supplied HTTPS image hosts retain their original browser redirect
and are not fetched by the server. Provider failures, temporary contention and a full
cache fall back to the original published image (`X-Product-Image-Cache: fallback`),
so a cache problem cannot discard a catalogue photo. These fallback images may still
open on the original host. No failure is stored as a successful cached image.

`GET /api/admin/image-cache` reports the image count, stored bytes and configured
budget to signed-in admins only. Cached images are never loaded into catalogue JSON
or page HTML. First-party image routes recheck publication before returning bytes or
honoring an ETag; unpublished products and stale filenames return 404. Browser caching
uses revalidation, not a public CDN cache that could outlive publication changes.

For a very large catalogue, move the binary cache to managed object storage/CDN
(for example the existing optional R2 integration) rather than continually increasing
the database budget. No storage-provider credentials or account changes are needed
for this bounded database cache.

Images remain normal accessible HTML images: zoom, open-in-new-tab, saving and assistive
technology keep working. Right-click blocking is not download protection and is not
an SEO fix. Keep any attribution and licences required by each source. Hosting a copy
does not change ownership. Google also supports image CDNs/other domains; useful alt
text, descriptive filenames, crawlable URLs and relevant product pages still matter.
See https://developers.google.com/search/docs/appearance/google-images.
