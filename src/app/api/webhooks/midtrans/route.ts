import { NextResponse } from "next/server";
import {
  verifyWebhookSignature,
  type MidtransNotification,
} from "@/lib/midtrans";
import { createServiceClient } from "@/lib/supabase/service";
import { sendWhatsApp } from "@/lib/fonnte";
import { broadcastOrderEvent } from "@/lib/realtime";
import type { JastipOrder, OrderStatus } from "@/lib/types";

// Midtrans payment notification webhook.
// Auth = HMAC signature. Notifications duplicate and can arrive out of order,
// so every state change is a forward-only conditional UPDATE (idempotent).
export async function POST(request: Request) {
  let n: MidtransNotification;
  try {
    n = (await request.json()) as MidtransNotification;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!verifyWebhookSignature(n)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const supabase = createServiceClient();

  const { data: order } = await supabase
    .from("jastip_orders")
    .select(
      "id, status, viewer_phone, viewer_name, item_name, amount_budget, streamer_id",
    )
    .eq("midtrans_order_id", n.order_id)
    .maybeSingle<
      Pick<
        JastipOrder,
        | "id"
        | "status"
        | "viewer_phone"
        | "viewer_name"
        | "item_name"
        | "amount_budget"
        | "streamer_id"
      >
    >();

  // Unknown order: ack with 200 so Midtrans stops retrying.
  if (!order) {
    return NextResponse.json({ received: true });
  }

  const status = n.transaction_status;
  const fraud = n.fraud_status;

  // Map Midtrans status -> target order status + the expected current status
  // that the transition is allowed from (forward-only).
  let target: OrderStatus | null = null;
  let from: OrderStatus = "pending_payment";

  if (status === "settlement" || (status === "capture" && fraud === "accept")) {
    target = "held_in_escrow";
    from = "pending_payment";
  } else if (status === "deny" || status === "cancel" || status === "expire") {
    target = "cancelled";
    from = "pending_payment";
  } else if (status === "refund" || status === "partial_refund") {
    target = "refunded";
    from = "held_in_escrow";
  }
  // 'pending' and anything else -> no-op.

  if (!target) {
    return NextResponse.json({ received: true });
  }

  // Conditional update: only transitions from the expected status. Duplicate
  // notifications hit 0 rows and no-op.
  const { data: updated } = await supabase
    .from("jastip_orders")
    .update({ status: target })
    .eq("id", order.id)
    .eq("status", from)
    .select("id")
    .maybeSingle();

  // Side effects only fire on the ACTUAL transition (updated !== null).
  if (updated && target === "held_in_escrow") {
    // Push a non-PII event to the streamer's live overlay.
    void broadcastOrderEvent(order.streamer_id, {
      id: order.id,
      viewer_name: order.viewer_name,
      item_name: order.item_name,
      amount_budget: order.amount_budget,
    });

    if (order.viewer_phone) {
      void sendWhatsApp(
        order.viewer_phone,
        `Pembayaran diterima! Dana Anda untuk "${order.item_name}" ditahan di sistem escrow kami hingga barang dibeli & dikonfirmasi.`,
      );
    }
  }

  return NextResponse.json({ received: true });
}
