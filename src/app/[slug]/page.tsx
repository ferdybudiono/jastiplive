import { notFound } from "next/navigation";
import Script from "next/script";
import { createServiceClient } from "@/lib/supabase/service";
import type { PublicProfile } from "@/lib/types";
import CheckoutForm from "@/components/checkout-form";

export const dynamic = "force-dynamic";

async function getStreamer(slug: string): Promise<PublicProfile | null> {
  const supabase = createServiceClient();
  // Safe RPC — returns public columns only (never bank details).
  const { data } = await supabase.rpc("get_streamer_by_slug", { p_slug: slug });
  const row = Array.isArray(data) ? data[0] : data;
  return (row as PublicProfile) ?? null;
}

const CLIENT_KEY = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? "";
// Sandbox client keys are prefixed "SB-"; production keys are not.
const SNAP_SRC = CLIENT_KEY.startsWith("SB-")
  ? "https://app.sandbox.midtrans.com/snap/snap.js"
  : "https://app.midtrans.com/snap/snap.js";

export default async function BuyerPage(props: PageProps<"/[slug]">) {
  const { slug } = await props.params;
  const streamer = await getStreamer(slug);
  if (!streamer) notFound();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <Script src={SNAP_SRC} data-client-key={CLIENT_KEY} strategy="afterInteractive" />

      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-lg items-center gap-3 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
            {(streamer.display_name ?? slug).charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900">
              {streamer.display_name ?? slug}
            </p>
            <p className="text-xs text-zinc-500">Titip belanja (jastip)</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-5 py-6">
        <h1 className="text-xl font-bold text-zinc-900">
          Titip barang ke {streamer.display_name ?? slug}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Isi detail titipanmu dan bayar via QRIS. Dana ditahan aman di escrow
          sampai barang dibeli.
        </p>

        <div className="mt-6">
          <CheckoutForm slug={slug} />
        </div>

        <p className="mt-6 text-center text-xs text-zinc-400">
          Dilindungi escrow. Pembayaran diproses oleh Midtrans.
        </p>
      </main>
    </div>
  );
}
