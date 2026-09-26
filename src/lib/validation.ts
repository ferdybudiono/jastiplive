import { z } from "zod";
import { MAX_ORDER_AMOUNT, MIN_ORDER_AMOUNT, SLUG_REGEX } from "./constants";

// Indonesian WhatsApp numbers: accept 08xxxxxxxxxx or 62xxxxxxxxxx (with or
// without leading +). Normalized to the 62... form by `normalizePhone`.
const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+?62|0)\d{8,13}$/, "Nomor WhatsApp tidak valid");

export const checkoutCreateSchema = z.object({
  slug: z.string().regex(SLUG_REGEX, "Slug tidak valid"),
  viewer_name: z.string().trim().min(1, "Nama wajib diisi").max(100),
  viewer_phone: phoneSchema,
  item_name: z.string().trim().min(1, "Nama barang wajib diisi").max(200),
  item_description: z.string().trim().max(1000).optional().or(z.literal("")),
  item_image_url: z.string().url().max(1000).optional().or(z.literal("")),
  amount_budget: z
    .number()
    .int("Budget harus berupa angka bulat (rupiah)")
    .min(MIN_ORDER_AMOUNT, `Minimal Rp ${MIN_ORDER_AMOUNT.toLocaleString("id-ID")}`)
    .max(MAX_ORDER_AMOUNT, `Maksimal Rp ${MAX_ORDER_AMOUNT.toLocaleString("id-ID")}`),
});
export type CheckoutCreateInput = z.infer<typeof checkoutCreateSchema>;

export const markPurchasedSchema = z.object({
  order_id: z.string().uuid(),
  receipt_image_url: z.string().url().max(1000),
});
export type MarkPurchasedInput = z.infer<typeof markPurchasedSchema>;

// Shared by the approve and reject routes — a seller action on one order.
export const orderActionSchema = z.object({
  order_id: z.string().uuid(),
});
export type OrderActionInput = z.infer<typeof orderActionSchema>;

// Buyer requests a Snap token for an approved order via its pay_token.
export const payCreateSchema = z.object({
  pay_token: z.string().min(16).max(128),
});
export type PayCreateInput = z.infer<typeof payCreateSchema>;

// Seller catalog item (managed from the dashboard). Price is an optional
// suggested amount; it is not a payment amount, so it is not clamped to the
// order MIN, only sanity-bounded.
export const catalogItemSchema = z.object({
  name: z.string().trim().min(1, "Nama barang wajib diisi").max(200),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  image_url: z.string().url().max(1000).optional().or(z.literal("")),
  price: z
    .number()
    .int("Harga harus berupa angka bulat (rupiah)")
    .min(0)
    .max(MAX_ORDER_AMOUNT)
    .optional(),
});
export type CatalogItemInput = z.infer<typeof catalogItemSchema>;

export const confirmDeliverySchema = z.object({
  token: z.string().min(16).max(128),
});
export type ConfirmDeliveryInput = z.infer<typeof confirmDeliverySchema>;

export const escrowReleaseSchema = z.object({
  order_id: z.string().uuid(),
});
export type EscrowReleaseInput = z.infer<typeof escrowReleaseSchema>;

export const registerSchema = z.object({
  email: z.string().trim().email("Email tidak valid").max(200),
  password: z.string().min(8, "Password minimal 8 karakter").max(72),
  slug: z.string().regex(SLUG_REGEX, "Slug tidak valid (3-30 huruf kecil/angka)"),
  display_name: z.string().trim().min(1, "Nama tampilan wajib diisi").max(100),
});
export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Normalize an Indonesian phone number to the `62...` international form
 * (no `+`, no leading `0`) as required by Fonnte.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.trim().replace(/[^\d]/g, "");
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("62")) return digits;
  return "62" + digits;
}
