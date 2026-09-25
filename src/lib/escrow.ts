import "server-only";
import { createServiceClient } from "./supabase/service";
import { createIrisPayout, approveIrisPayout } from "./midtrans";
import { sendWhatsApp } from "./fonnte";
import { normalizePhone } from "./validation";
import type { JastipOrder, Profile } from "./types";

export interface ReleaseResult {
  ok: boolean;
  status: number; // suggested HTTP status
  message: string;
}

/**
 * Release escrow for a `purchased` order and disburse the streamer payout via
 * Iris. Safe to call from the dashboard, the buyer confirm flow, or the cron.
 *
 * Idempotency: an atomic optimistic-lock UPDATE claims the order
 * (status purchased -> completed, payout_status -> processing) before any Iris
 * call. If 0 rows are claimed the order was already released/ineligible, so we
 * abort without paying out again.
 *
 * @param streamerId when provided, also requires the order to belong to this
 *   streamer (used for dashboard-initiated releases; omitted for cron).
 */
export async function releaseOrder(
  orderId: string,
  streamerId?: string,
): Promise<ReleaseResult> {
  const supabase = createServiceClient();

  // --- Atomic claim (double-payout guard) ---
  let claim = supabase
    .from("jastip_orders")
    .update({ status: "completed", payout_status: "processing" })
    .eq("id", orderId)
    .eq("status", "purchased")
    .or("payout_status.is.null,payout_status.eq.failed");
  if (streamerId) claim = claim.eq("streamer_id", streamerId);

  const { data: order, error: claimErr } = await claim
    .select("*")
    .maybeSingle<JastipOrder>();

  if (claimErr) {
    return { ok: false, status: 500, message: "Gagal memproses pesanan" };
  }
  if (!order) {
    // Not found, not owned, not 'purchased', or already released/in-flight.
    return { ok: false, status: 409, message: "Pesanan tidak dapat dicairkan" };
  }

  // --- Load streamer bank details ---
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", order.streamer_id)
    .maybeSingle<Profile>();

  if (
    !profile?.bank_code ||
    !profile.bank_account_number ||
    !profile.bank_account_holder
  ) {
    await revert(orderId);
    return { ok: false, status: 400, message: "Detail rekening streamer belum lengkap" };
  }

  // --- Disburse via Iris ---
  try {
    const payout = await createIrisPayout({
      beneficiaryName: profile.bank_account_holder,
      beneficiaryAccount: profile.bank_account_number,
      beneficiaryBank: profile.bank_code,
      amount: order.streamer_payout_amount,
      notes: `Jastip ${order.midtrans_order_id}`,
    });

    // Store the reference immediately for traceability.
    await supabase
      .from("jastip_orders")
      .update({ iris_reference_no: payout.reference_no })
      .eq("id", orderId);

    // Approve unless the Iris account is configured for auto-approve.
    if (process.env.MIDTRANS_IRIS_AUTO_APPROVE !== "true") {
      try {
        await approveIrisPayout([payout.reference_no], process.env.IRIS_APPROVE_OTP);
      } catch {
        // Payout is already queued; approval can be retried out-of-band.
        // Do NOT revert here — funds may still be sent.
      }
    }

    await supabase
      .from("jastip_orders")
      .update({ payout_status: "completed" })
      .eq("id", orderId);
  } catch {
    await revert(orderId);
    return {
      ok: false,
      status: 502,
      message: "Pencairan gagal (kemungkinan saldo belum settle). Coba lagi nanti.",
    };
  }

  // --- Notify streamer (best effort) ---
  if (order.viewer_phone) {
    void sendWhatsApp(
      normalizePhone(order.viewer_phone),
      `Pesanan "${order.item_name}" selesai. Terima kasih sudah menggunakan layanan jastip!`,
    );
  }

  return { ok: true, status: 200, message: "Pesanan selesai & dana dicairkan ke streamer" };
}

async function revert(orderId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("jastip_orders")
    .update({ status: "purchased", payout_status: "failed" })
    .eq("id", orderId);
}
