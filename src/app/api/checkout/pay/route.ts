import { NextResponse } from "next/server";
import { payCreateSchema } from "@/lib/validation";
import { createServiceClient } from "@/lib/supabase/service";
import { createSnapTransaction } from "@/lib/midtrans";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import type { CheckoutPayResponse, JastipOrder } from "@/lib/types";

// Public, unauthenticated. After a seller approves a request (status
// pending_payment), the buyer calls this with their pay_token to get a fresh
// Midtrans Snap token. Amount/fees are read from the stored order row — never
// trusted from the client. Rate-limited by IP + pay_token.
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = payCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Data tidak valid" },
      { status: 422 },
    );
  }
  const { pay_token } = parsed.data;

  const limit = rateLimit(`pay:${clientIp(request)}:${pay_token}`, 5, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }

  const supabase = createServiceClient();

  const { data: order } = await supabase
    .from("jastip_orders")
    .select(
      "id, status, amount_budget, viewer_name, viewer_phone, item_name, midtrans_order_id",
    )
    .eq("pay_token", pay_token)
    .maybeSingle<
      Pick<
        JastipOrder,
        | "id"
        | "status"
        | "amount_budget"
        | "viewer_name"
        | "viewer_phone"
        | "item_name"
        | "midtrans_order_id"
      >
    >();

  if (!order) {
    return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }
  if (order.status !== "pending_payment") {
    return NextResponse.json(
      { error: "Pesanan belum disetujui atau sudah diproses" },
      { status: 409 },
    );
  }

  let snap;
  try {
    // Snap tokens can expire, so we always mint a fresh one for the same
    // midtrans_order_id (Midtrans returns a token for the existing transaction).
    snap = await createSnapTransaction({
      orderId: order.midtrans_order_id,
      grossAmount: order.amount_budget,
      customerName: order.viewer_name ?? "Pembeli",
      customerPhone: order.viewer_phone ?? "",
      itemName: order.item_name,
      finishUrl: `${process.env.NEXT_PUBLIC_APP_URL}/pay/${pay_token}`,
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

  return NextResponse.json({ snap_token: snap.token } satisfies CheckoutPayResponse);
}
