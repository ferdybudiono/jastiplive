// Shared domain + database types for the Jastip SaaS platform.
// Money is stored as INTEGER rupiah (Postgres `bigint`). IDR has no minor unit,
// and Midtrans/Iris expect whole-rupiah amounts, so we never use floats for money.

export type OrderStatus =
  | "pending_approval" // buyer request awaiting seller approve/reject
  | "pending_payment" // seller approved; awaiting buyer payment
  | "held_in_escrow"
  | "purchased"
  | "completed"
  | "cancelled"
  | "rejected" // seller declined the request
  | "refunded";

export type PayoutStatus = "processing" | "completed" | "failed";

/** Row shape of the `profiles` table. */
export interface Profile {
  id: string; // uuid, references auth.users.id
  display_name: string | null;
  slug: string;
  bank_code: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
  platform_fee_percent: number; // numeric(5,2), default 5.0
  created_at: string;
}

/** Public-safe subset of a profile (no bank/PII). Returned to anonymous buyers. */
export interface PublicProfile {
  id: string;
  display_name: string | null;
  slug: string;
  platform_fee_percent: number;
}

/** Row shape of the `jastip_orders` table. */
export interface JastipOrder {
  id: string; // uuid
  streamer_id: string; // references profiles.id
  viewer_name: string | null;
  viewer_phone: string | null;
  item_name: string;
  item_description: string | null;
  item_image_url: string | null;
  receipt_image_url: string | null;
  amount_budget: number; // integer rupiah
  platform_fee: number; // integer rupiah
  streamer_payout_amount: number; // integer rupiah
  status: OrderStatus;
  payout_status: PayoutStatus | null;
  iris_reference_no: string | null;
  confirm_token: string | null;
  pay_token: string | null; // buyer's handle for the realtime channel + /pay page
  purchased_at: string | null;
  midtrans_order_id: string;
  midtrans_snap_token: string | null;
  created_at: string;
  updated_at: string;
}

/** Row shape of the `catalog_items` table. */
export interface CatalogItem {
  id: string; // uuid
  streamer_id: string; // references profiles.id
  name: string;
  description: string | null;
  image_url: string | null;
  price: number | null; // integer rupiah, suggested price (optional)
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Public-safe catalog item (returned by get_catalog_by_slug to anon buyers). */
export interface PublicCatalogItem {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number | null;
}

// ---- API payload types ----

/** Response of POST /api/checkout/create — a request awaiting seller approval. */
export interface CheckoutCreateResponse {
  order_id: string;
  pay_token: string;
}

/** Response of POST /api/checkout/pay — a Snap token for an approved order. */
export interface CheckoutPayResponse {
  snap_token: string;
}

export interface ApiError {
  error: string;
}
