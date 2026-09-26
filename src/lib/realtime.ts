import "server-only";

// Realtime Broadcast helper. The public overlay is anonymous and has NO
// SELECT policy on jastip_orders (which would leak viewer_phone via
// postgres_changes). Instead the server broadcasts a curated, non-PII payload
// to a per-streamer channel that the overlay subscribes to with the anon key.

export interface OverlayOrderEvent {
  id: string;
  viewer_name: string | null; // shown on the overlay per spec
  item_name: string;
  amount_budget: number;
  // NOTE: viewer_phone is deliberately never included.
}

/** Broadcast a new-order event to the streamer's overlay channel. */
export async function broadcastOrderEvent(
  streamerId: string,
  payload: OverlayOrderEvent,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `overlay:${streamerId}`,
            event: "new_order",
            payload,
          },
        ],
      }),
    });
  } catch {
    // Best effort — the dashboard is the source of truth, not the overlay.
  }
}

/**
 * Broadcast an order status change to the buyer's per-order channel.
 *
 * The buyer page is anonymous (no SELECT policy on jastip_orders), so it cannot
 * use postgres_changes. Instead the buyer subscribes to `order:<pay_token>`
 * with the anon key, and the server pushes a curated, non-PII payload here when
 * the seller approves or rejects. `pay_token` is unguessable, so it doubles as
 * the channel's access control.
 */
export async function broadcastOrderStatus(
  payToken: string,
  status: "approved" | "rejected",
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `order:${payToken}`,
            event: "status_change",
            payload: { status },
          },
        ],
      }),
    });
  } catch {
    // Best effort — the buyer also gets a WhatsApp link and the /pay page.
  }
}
