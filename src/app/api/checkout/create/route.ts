import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { checkoutCreateSchema, normalizePhone } from "@/lib/validation";
import { createServiceClient } from "@/lib/supabase/service";
import { computeFees } from "@/lib/fees";
import { sendWhatsApp } from "@/lib/fonnte";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import type { CheckoutCreateResponse } from "@/lib/types";

const rupiah = (n: number) => "Rp " + n.toLocaleString("id-ID");

// Public, unauthenticated. Creates a buyer REQUEST awaiting seller approval
// (status = pending_approval). No payment happens here — the Snap transaction
// is created later, after the seller approves, via /api/checkout/pay.
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = checkoutCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Data tidak valid" },
      { status: 422 },
    );
  }
  const input = parsed.data;

  // Best-effort throttle: IP + slug.
  const limit = rateLimit(`checkout:${clientIp(request)}:${input.slug}`, 5, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }

  const supabase = createServiceClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, platform_fee_percent, bank_code, bank_account_number, bank_account_holder")
    .eq("slug", input.slug)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Streamer tidak ditemukan" }, { status: 404 });
  }
  if (!profile.bank_code || !profile.bank_account_number || !profile.bank_account_holder) {
    return NextResponse.json(
      { error: "Streamer ini belum mengaktifkan pembayaran" },
      { status: 409 },
    );
  }

  // Fees are ALWAYS computed server-side from the profile (never trust client).
  const fees = computeFees(input.amount_budget, Number(profile.platform_fee_percent));
  const orderId = `jl-${input.slug}-${nanoid(10)}`;
  const confirmToken = nanoid(32);
  const payToken = nanoid(32);
  const phone = normalizePhone(input.viewer_phone);

  const { data: order, error: insertErr } = await supabase
    .from("jastip_orders")
    .insert({
      streamer_id: profile.id,
      viewer_name: input.viewer_name,
      viewer_phone: phone,
      item_name: input.item_name,
      item_description: input.item_description || null,
      item_image_url: input.item_image_url || null,
      amount_budget: fees.amountBudget,
      platform_fee: fees.platformFee,
      streamer_payout_amount: fees.payout,
      status: "pending_approval",
      confirm_token: confirmToken,
      pay_token: payToken,
      midtrans_order_id: orderId,
    })
    .select("id")
    .single();

  if (insertErr || !order) {
    return NextResponse.json({ error: "Gagal membuat pesanan" }, { status: 500 });
  }

  // Tell the buyer the request was sent and is awaiting approval (best effort).
  void sendWhatsApp(
    phone,
    `Halo ${input.viewer_name}! Permintaan jastip "${input.item_name}" senilai ${rupiah(
      fees.amountBudget,
    )} sudah dikirim ke seller.\n\nTunggu persetujuan seller ya — kami akan kirim link pembayaran begitu disetujui.`,
  );

  return NextResponse.json({
    order_id: order.id,
    pay_token: payToken,
  } satisfies CheckoutCreateResponse);
}
