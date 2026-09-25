// Slugs that would collide with (or be shadowed by) system routes.
//
// In the App Router, static segments (/login, /dashboard, /api, ...) take
// precedence over the dynamic /[slug] segment. A streamer who claimed one of
// these as their slug would get an unreachable buyer page, so we block them
// at registration time.

export const RESERVED_SLUGS = new Set<string>([
  "api",
  "login",
  "register",
  "dashboard",
  "overlay",
  "confirm",
  "admin",
  "auth",
  "settings",
  "account",
  "profile",
  "static",
  "public",
  "assets",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "about",
  "pricing",
  "terms",
  "privacy",
  "help",
  "support",
]);

/** Valid slug: 3-30 chars, lowercase letters, digits and single hyphens. */
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug) && !RESERVED_SLUGS.has(slug);
}

/** Minimum order amount in rupiah (guards against dust/spam orders). */
export const MIN_ORDER_AMOUNT = 10_000;
/** Maximum order amount in rupiah (sanity ceiling). */
export const MAX_ORDER_AMOUNT = 50_000_000;

/** Days after `purchased` before an order auto-releases from escrow. */
export const AUTO_RELEASE_DAYS = 3;

/** Supabase Storage bucket for buyer-uploaded item photos. */
export const ITEM_IMAGES_BUCKET = "item-images";
/** Supabase Storage bucket for streamer-uploaded purchase receipts. */
export const RECEIPTS_BUCKET = "receipts";
