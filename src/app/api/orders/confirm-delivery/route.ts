import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { confirmDeliverySchema } from "@/lib/validation";
import { releaseOrder } from "@/lib/escrow";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import type { JastipOrder } from "@/lib/types";

// Buyer confirms delivery via their WhatsApp magic link. Auth = the per-order
// confirm_token only: the buyer has no session and can only act on the single
// order the token belongs to. Triggers the shared escrow release routine.
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = confirmDeliverySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Token tidak valid" },
      { status: 422 },
    );
  }

  // Throttle token guessing by IP.
  const limit = rateLimit(`confirm:${clientIp(request)}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }

  const supabase = createServiceClient();

  // Resolve the token to an order (confirm_token has a unique index).
  const { data: order } = await supabase
    .from("jastip_orders")
    .select("id, status")
    .eq("confirm_token", parsed.data.token)
    .maybeSingle<Pick<JastipOrder, "id" | "status">>();

  if (!order) {
    return NextResponse.json({ error: "Tautan tidak valid" }, { status: 404 });
  }

  if (order.status === "completed") {
    // Already released (buyer double-tapped, or auto-release ran). Idempotent.
    return NextResponse.json({ ok: true, message: "Pesanan sudah selesai" });
  }
  if (order.status !== "purchased") {
    return NextResponse.json(
      { error: "Pesanan belum dapat dikonfirmasi" },
      { status: 409 },
    );
  }

  // Shared, idempotent release + payout (atomic claim inside guards double pay).
  const result = await releaseOrder(order.id);
  return NextResponse.json(
    result.ok ? { ok: true, message: result.message } : { error: result.message },
    { status: result.status },
  );
}
