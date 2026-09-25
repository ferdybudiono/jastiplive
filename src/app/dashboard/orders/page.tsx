import { createClient } from "@/lib/supabase/server";
import type { JastipOrder } from "@/lib/types";
import { rupiah, STATUS_LABELS } from "@/lib/format";
import OrderCard from "@/components/order-card";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  held_in_escrow: "bg-blue-50 text-blue-700",
  purchased: "bg-amber-50 text-amber-700",
  completed: "bg-green-50 text-green-700",
  cancelled: "bg-zinc-100 text-zinc-500",
  refunded: "bg-zinc-100 text-zinc-500",
  pending_payment: "bg-zinc-100 text-zinc-500",
};

export default async function OrdersPage() {
  const supabase = await createClient();

  // RLS restricts this to the signed-in streamer's own orders.
  const { data: orders } = await supabase
    .from("jastip_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<JastipOrder[]>();

  const list = orders ?? [];

  // Income summary.
  const active = list.filter(
    (o) => o.status === "held_in_escrow" || o.status === "purchased",
  );
  const completed = list.filter((o) => o.status === "completed");
  const heldTotal = active.reduce((s, o) => s + o.streamer_payout_amount, 0);
  const earnedTotal = completed.reduce(
    (s, o) => s + o.streamer_payout_amount,
    0,
  );
  const feesTotal = [...active, ...completed].reduce(
    (s, o) => s + o.platform_fee,
    0,
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-900">Pesanan</h1>

      {/* Income summary */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Dana di escrow (belum cair)</p>
          <p className="mt-1 text-xl font-bold text-zinc-900">
            {rupiah(heldTotal)}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Total diterima (bersih)</p>
          <p className="mt-1 text-xl font-bold text-green-700">
            {rupiah(earnedTotal)}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Komisi platform (5%)</p>
          <p className="mt-1 text-xl font-bold text-zinc-900">
            {rupiah(feesTotal)}
          </p>
        </div>
      </div>

      {/* Orders list */}
      <div className="mt-6 space-y-3">
        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center">
            <p className="text-sm text-zinc-500">
              Belum ada pesanan. Bagikan link jastip-mu ke penonton live!
            </p>
          </div>
        ) : (
          list.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              statusLabel={STATUS_LABELS[order.status] ?? order.status}
              statusClass={STATUS_STYLES[order.status] ?? "bg-zinc-100"}
            />
          ))
        )}
      </div>
    </div>
  );
}
