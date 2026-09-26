import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CatalogItem } from "@/lib/types";
import CatalogManager from "@/components/catalog-manager";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (!claims) redirect("/login?next=/dashboard/catalog");
  const streamerId = claims.sub as string;

  // RLS restricts this to the signed-in streamer's own catalog items.
  const { data: items } = await supabase
    .from("catalog_items")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .returns<CatalogItem[]>();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-zinc-900">Katalog</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Barang di katalog tampil di halaman jastip-mu. Buyer bisa mengetuknya
        untuk mengisi form request otomatis.
      </p>
      <div className="mt-6">
        <CatalogManager streamerId={streamerId} initialItems={items ?? []} />
      </div>
    </div>
  );
}
