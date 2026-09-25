import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { checkoutCreateSchema, normalizePhone } from "@/lib/validation";
import { createServiceClient } from "@/lib/supabase/service";
import { computeFees } from "@/lib/fees";
import { createSnapTransaction } from "@/lib/midtrans";
import { sendWhatsApp } from "@/lib/fonnte";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import type { CheckoutCreateResponse } from "@/lib/types";

const rupiah = (n: number) => "Rp " + n.toLocaleString("id-ID");

// Public, unauthenticated. Creates a pending order, a Midtrans Snap
// transaction, and sends the buyer a WhatsApp payment link.
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
      status: "pending_payment",
      confirm_token: confirmToken,
      midtrans_order_id: orderId,
    })
    .select("id")
    .single();

  if (insertErr || !order) {
    return NextResponse.json({ error: "Gagal membuat pesanan" }, { status: 500 });
  }

  let snap;
  try {
    snap = await createSnapTransaction({
      orderId,
      grossAmount: fees.amountBudget,
      customerName: input.viewer_name,
      customerPhone: phone,
      itemName: input.item_name,
      finishUrl: `${process.env.NEXT_PUBLIC_APP_URL}/${input.slug}`,
    });
  } catch {
    return NextResponse.json(
      { error: "Gagal membuat transaksi pembayaran" },
      { status: 502 },
    );
  }

  await supabase
    .from("jastip_orders")
    .update({ midtrans_snap_token: snap.token })
    .eq("id", order.id);

  // WhatsApp payment link (best effort — never fails the request).
  void sendWhatsApp(
    phone,
    `Halo ${input.viewer_name}! Pesanan jastip "${input.item_name}" senilai ${rupiah(
      fees.amountBudget,
    )} sudah dibuat.\n\nSelesaikan pembayaran di sini:\n${snap.redirect_url}`,
  );

  return NextResponse.json({
    midtrans_order_id: orderId,
    snap_token: snap.token,
  } satisfies CheckoutCreateResponse);
}
