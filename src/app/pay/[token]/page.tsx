import { notFound } from "next/navigation";
import Script from "next/script";
import { createServiceClient } from "@/lib/supabase/service";
import { rupiah } from "@/lib/format";
import type { JastipOrder } from "@/lib/types";
import PayClient from "@/components/pay-client";

export const dynamic = "force-dynamic";

const CLIENT_KEY = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? "";
// Sandbox client keys are prefixed "SB-"; production keys are not.
const SNAP_SRC = CLIENT_KEY.startsWith("SB-")
  ? "https://app.sandbox.midtrans.com/snap/snap.js"
  : "https://app.midtrans.com/snap/snap.js";

// Public WhatsApp-fallback pay page. Looked up by the unguessable pay_token.
// We never render viewer_phone here — only the minimal item/amount/status.
type PayOrder = Pick<
  JastipOrder,
  "item_name" | "item_image_url" | "amount_budget" | "status"
>;

async function getOrder(payToken: string): Promise<PayOrder | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("jastip_orders")
    .select("item_name, item_image_url, amount_budget, status")
    .eq("pay_token", payToken)
    .maybeSingle<PayOrder>();
  return data ?? null;
}

export default async function PayPage(props: PageProps<"/pay/[token]">) {
  const { token } = await props.params;
  const order = await getOrder(token);
  if (!order) notFound();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <Script src={SNAP_SRC} data-client-key={CLIENT_KEY} strategy="afterInteractive" />

      <main className="mx-auto w-full max-w-lg flex-1 px-5 py-8">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="flex items-start gap-4">
            {order.item_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={order.item_image_url}
                alt={order.item_name}
                className="h-20 w-20 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-3xl">
                🛍️
              </div>
            )}
            <div className="min-w-0">
              <p className="text-base font-semibold text-zinc-900">
                {order.item_name}
              </p>
              <p className="mt-1 text-lg font-bold text-indigo-600">
                {rupiah(order.amount_budget)}
              </p>
            </div>
          </div>

          <div className="mt-6">
            {order.status === "pending_payment" ? (
              <PayClient payToken={token} />
            ) : order.status === "pending_approval" ? (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-center text-sm text-indigo-700">
                Permintaan ini masih menunggu persetujuan seller. Kami akan
                mengirim link pembayaran begitu disetujui.
              </div>
            ) : order.status === "rejected" ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
                Maaf, permintaan ini ditolak seller.
              </div>
            ) : (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center text-sm text-green-700">
                Pesanan ini sudah diproses. Terima kasih!
              </div>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-400">
          Dilindungi escrow. Pembayaran diproses oleh Midtrans.
        </p>
      </main>
    </div>
  );
}
