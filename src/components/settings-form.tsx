"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isValidSlug } from "@/lib/constants";
import { Button, Card, Field, Input } from "@/components/ui";
import type { Profile } from "@/lib/types";

// Common Indonesian bank codes accepted by Midtrans Iris.
const BANKS = [
  { code: "bca", name: "BCA" },
  { code: "mandiri", name: "Mandiri" },
  { code: "bni", name: "BNI" },
  { code: "bri", name: "BRI" },
  { code: "cimb", name: "CIMB Niaga" },
  { code: "permata", name: "Permata" },
  { code: "danamon", name: "Danamon" },
  { code: "bsyariah_mandiri", name: "Bank Syariah Indonesia" },
  { code: "gopay", name: "GoPay" },
];

type EditableProfile = Pick<
  Profile,
  | "id"
  | "display_name"
  | "slug"
  | "bank_code"
  | "bank_account_number"
  | "bank_account_holder"
>;

export default function SettingsForm({ profile }: { profile: EditableProfile }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [slug, setSlug] = useState(profile.slug);
  const [bankCode, setBankCode] = useState(profile.bank_code ?? "");
  const [accNumber, setAccNumber] = useState(profile.bank_account_number ?? "");
  const [accHolder, setAccHolder] = useState(profile.bank_account_holder ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!isValidSlug(slug)) {
      setMsg({ ok: false, text: "Link jastip tidak valid atau sudah dipakai sistem." });
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      // RLS ensures a streamer can only update their own row.
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName || null,
          slug,
          bank_code: bankCode || null,
          bank_account_number: accNumber || null,
          bank_account_holder: accHolder || null,
        })
        .eq("id", profile.id);

      if (error) {
        const dup = error.message?.toLowerCase().includes("duplicate");
        setMsg({
          ok: false,
          text: dup
            ? "Link jastip ini sudah dipakai streamer lain."
            : "Gagal menyimpan perubahan.",
        });
        return;
      }
      setMsg({ ok: true, text: "Tersimpan!" });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "Terjadi kesalahan jaringan." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card className="space-y-4">
        <h2 className="text-base font-semibold text-zinc-900">Profil</h2>
        <Field label="Nama tampilan" htmlFor="display_name">
          <Input
            id="display_name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
          />
        </Field>
        <Field
          label="Link jastip"
          htmlFor="slug"
          hint={`Halamanmu: /${slug}`}
        >
          <Input
            id="slug"
            value={slug}
            onChange={(e) =>
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
            }
          />
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-base font-semibold text-zinc-900">
          Rekening pencairan
        </h2>
        <p className="text-sm text-zinc-500">
          Dana (95% dari setiap pesanan) dicairkan ke rekening ini.
        </p>
        <Field label="Bank" htmlFor="bank">
          <select
            id="bank"
            value={bankCode}
            onChange={(e) => setBankCode(e.target.value)}
            className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">Pilih bank…</option>
            {BANKS.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nomor rekening" htmlFor="acc_number">
          <Input
            id="acc_number"
            inputMode="numeric"
            value={accNumber}
            onChange={(e) =>
              setAccNumber(e.target.value.replace(/[^0-9]/g, ""))
            }
            placeholder="1234567890"
          />
        </Field>
        <Field
          label="Nama pemilik rekening"
          htmlFor="acc_holder"
          hint="Harus sama persis dengan nama di rekening bank."
        >
          <Input
            id="acc_holder"
            value={accHolder}
            onChange={(e) => setAccHolder(e.target.value)}
            placeholder="Nama sesuai buku tabungan"
          />
        </Field>
      </Card>

      {msg ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={busy}>
        {busy ? "Menyimpan…" : "Simpan perubahan"}
      </Button>
    </form>
  );
}
