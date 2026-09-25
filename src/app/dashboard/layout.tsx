import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import LogoutButton from "@/components/logout-button";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (!claims) redirect("/login?next=/dashboard/orders");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, slug, bank_code, bank_account_number")
    .eq("id", claims.sub as string)
    .maybeSingle<
      Pick<Profile, "display_name" | "slug" | "bank_code" | "bank_account_number">
    >();

  const bankReady = Boolean(profile?.bank_code && profile?.bank_account_number);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/dashboard/orders" className="text-lg font-bold text-zinc-900">
            Jastip<span className="text-indigo-600">Live</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-zinc-500 sm:inline">
              {profile?.display_name ?? profile?.slug}
            </span>
            <LogoutButton />
          </div>
        </div>
        <nav className="mx-auto flex w-full max-w-5xl gap-1 px-6">
          <Link
            href="/dashboard/orders"
            className="border-b-2 border-transparent px-3 py-3 text-sm font-medium text-zinc-600 hover:text-zinc-900"
          >
            Pesanan
          </Link>
          <Link
            href="/dashboard/settings"
            className="border-b-2 border-transparent px-3 py-3 text-sm font-medium text-zinc-600 hover:text-zinc-900"
          >
            Pengaturan
          </Link>
        </nav>
      </header>

      {!bankReady ? (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto w-full max-w-5xl px-6 py-3 text-sm text-amber-800">
            Rekening bank belum lengkap — kamu belum bisa menerima pencairan.{" "}
            <Link href="/dashboard/settings" className="font-semibold underline">
              Lengkapi sekarang
            </Link>
          </div>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
