import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { orderActionSchema } from "@/lib/validation";
import { broadcastOrderStatus } from "@/lib/realtime";
import { sendWhatsApp } from "@/lib/fonnte";
import type { JastipOrder } from "@/lib/types";

const rupiah = (n: number) => "Rp " + n.toLocaleString("id-ID");

// Streamer approves a buyer request: pending_approval -> pending_payment.
// The buyer's page updates in realtime (broadcast) and also gets a WhatsApp
// pay link as a fallback. Auth = streamer session; only the owning streamer.
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = orderActionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Data tidak valid" },
      { status: 422 },
    );
  }

  const authClient = await createClient();
  const { data: authData } = await authClient.auth.getClaims();
  const claims = authData?.claims;
  if (!claims) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const streamerId = claims.sub as string;

  const supabase = createServiceClient();

  const { data: order } = await supabase
    .from("jastip_orders")
    .select("id, streamer_id, status, pay_token, viewer_phone, item_name, amount_budget")
    .eq("id", parsed.data.order_id)
    .maybeSingle<
      Pick<
        JastipOrder,
        | "id"
        | "streamer_id"
        | "status"
        | "pay_token"
        | "viewer_phone"
        | "item_name"
        | "amount_budget"
      >
    >();

  if (!order) {
    return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }
  if (order.streamer_id !== streamerId) {
    return NextResponse.json({ error: "Bukan pesanan Anda" }, { status: 403 });
  }

  // Conditional transition pending_approval -> pending_payment.
  const { data: updated } = await supabase
    .from("jastip_orders")
    .update({ status: "pending_payment" })
    .eq("id", order.id)
    .eq("status", "pending_approval")
    .select("id")
    .maybeSingle();

  if (!updated) {
    return NextResponse.json(
      { error: "Request tidak menunggu persetujuan (mungkin sudah diproses)" },
      { status: 409 },
    );
  }

  // Notify the buyer: realtime (page) + WhatsApp pay link (fallback).
  if (order.pay_token) {
    void broadcastOrderStatus(order.pay_token, "approved");
    if (order.viewer_phone) {
      const payUrl = `${process.env.NEXT_PUBLIC_APP_URL}/pay/${order.pay_token}`;
      void sendWhatsApp(
        order.viewer_phone,
        `Kabar baik! Request jastip "${order.item_name}" senilai ${rupiah(
          order.amount_budget,
        )} sudah DISETUJUI seller.\n\nSelesaikan pembayaran di sini:\n${payUrl}`,
      );
    }
  }

  return NextResponse.json({ ok: true });
}
