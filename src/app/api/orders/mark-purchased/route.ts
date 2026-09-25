import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { markPurchasedSchema } from "@/lib/validation";
import { sendWhatsApp } from "@/lib/fonnte";
import type { JastipOrder } from "@/lib/types";

// Streamer marks an order as purchased: uploads a receipt and starts the
// 3-day auto-release timer. Auth = streamer session; only the owning streamer
// may act, and only on an order that is currently held_in_escrow.
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = markPurchasedSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Data tidak valid" },
      { status: 422 },
    );
  }

  // --- Authenticate the streamer (getClaims verifies the JWT signature) ---
  const authClient = await createClient();
  const { data: authData } = await authClient.auth.getClaims();
  const claims = authData?.claims;
  if (!claims) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const streamerId = claims.sub as string;

  // Service client for the writes (RLS-bypassing). We enforce ownership +
  // state ourselves via conditional filters.
  const supabase = createServiceClient();

  const { data: order } = await supabase
    .from("jastip_orders")
    .select("id, streamer_id, status, confirm_token, viewer_phone, item_name")
    .eq("id", parsed.data.order_id)
    .maybeSingle<
      Pick<
        JastipOrder,
        "id" | "streamer_id" | "status" | "confirm_token" | "viewer_phone" | "item_name"
      >
    >();

  if (!order) {
    return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }
  if (order.streamer_id !== streamerId) {
    return NextResponse.json({ error: "Bukan pesanan Anda" }, { status: 403 });
  }

  // Conditional transition held_in_escrow -> purchased (starts the timer).
  const { data: updated } = await supabase
    .from("jastip_orders")
    .update({
      status: "purchased",
      receipt_image_url: parsed.data.receipt_image_url,
      purchased_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("status", "held_in_escrow")
    .select("id")
    .maybeSingle();

  if (!updated) {
    return NextResponse.json(
      { error: "Pesanan tidak dalam status escrow (mungkin sudah diproses)" },
      { status: 409 },
    );
  }

  // Ask the buyer to confirm delivery via a per-order magic link.
  if (order.viewer_phone && order.confirm_token) {
    const confirmUrl = `${process.env.NEXT_PUBLIC_APP_URL}/confirm/${order.confirm_token}`;
    void sendWhatsApp(
      order.viewer_phone,
      `Barang titipan Anda "${order.item_name}" sudah dibeli! Setelah menerima barang, konfirmasi di sini agar dana diteruskan ke streamer:\n${confirmUrl}\n\n(Dana akan dilepas otomatis dalam 3 hari jika tidak ada konfirmasi.)`,
    );
  }

  return NextResponse.json({ ok: true });
}
