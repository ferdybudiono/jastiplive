import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import SettingsForm from "@/components/settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (!claims) redirect("/login?next=/dashboard/settings");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, display_name, slug, bank_code, bank_account_number, bank_account_holder",
    )
    .eq("id", claims.sub as string)
    .maybeSingle<
      Pick<
        Profile,
        | "id"
        | "display_name"
        | "slug"
        | "bank_code"
        | "bank_account_number"
        | "bank_account_holder"
      >
    >();

  if (!profile) redirect("/login");

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-zinc-900">Pengaturan</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Atur nama tampilan, link jastip, dan rekening pencairan.
      </p>
      <div className="mt-6">
        <SettingsForm profile={profile} />
      </div>
    </div>
  );
}
