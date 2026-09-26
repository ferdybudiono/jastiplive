"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ITEM_IMAGES_BUCKET,
  MAX_ORDER_AMOUNT,
  MIN_ORDER_AMOUNT,
} from "@/lib/constants";
import { rupiah } from "@/lib/format";
import { Button, Field, Input, Textarea } from "@/components/ui";
import PayClient from "@/components/pay-client";

/** Prefill from a clicked catalog item (buyer can still edit everything). */
export interface CheckoutPrefill {
  item_name?: string;
  item_description?: string;
  item_image_url?: string;
  amount?: number;
}

type Phase =
  | "form"
  | "submitting"
  | "waiting_approval" // request sent; awaiting seller approve/reject (realtime)
  | "approved" // seller approved — show the pay button
  | "rejected";

export default function CheckoutForm({
  slug,
  prefill,
}: {
  slug: string;
  prefill?: CheckoutPrefill;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [itemName, setItemName] = useState(prefill?.item_name ?? "");
  const [itemDesc, setItemDesc] = useState(prefill?.item_description ?? "");
  const [amount, setAmount] = useState(
    prefill?.amount ? String(prefill.amount) : "",
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  // A prefilled catalog image is an already-uploaded URL; used unless the buyer
  // picks their own file.
  const prefillImageUrl = prefill?.item_image_url;
  const [uploading, setUploading] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const [payToken, setPayToken] = useState<string | null>(null);

  const busy = phase === "submitting" || uploading;

  // Subscribe to the buyer's per-order channel once the request is sent. The
  // server broadcasts `status_change` when the seller approves/rejects. The
  // pay_token is unguessable and doubles as the channel's access control.
  useEffect(() => {
    if (!payToken || phase !== "waiting_approval") return;
    const supabase = createClient();
    const channel = supabase
      .channel(`order:${payToken}`)
      .on("broadcast", { event: "status_change" }, ({ payload }) => {
        const status = (payload as { status?: string })?.status;
        if (status === "approved") setPhase("approved");
        else if (status === "rejected") setPhase("rejected");
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [payToken, phase]);

  async function uploadImage(): Promise<string | undefined> {
    if (!imageFile) return prefillImageUrl || undefined;
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = imageFile.name.split(".").pop() ?? "jpg";
      const path = `${slug}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(ITEM_IMAGES_BUCKET)
        .upload(path, imageFile, { upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage
        .from(ITEM_IMAGES_BUCKET)
        .getPublicUrl(path);
      return data.publicUrl;
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amountNum = Math.round(Number(amount));
    if (!Number.isFinite(amountNum) || amountNum < MIN_ORDER_AMOUNT) {
      setError(`Budget minimal ${rupiah(MIN_ORDER_AMOUNT)}`);
      return;
    }
    if (amountNum > MAX_ORDER_AMOUNT) {
      setError(`Budget maksimal ${rupiah(MAX_ORDER_AMOUNT)}`);
      return;
    }

    setPhase("submitting");
    try {
      let imageUrl: string | undefined;
      try {
        imageUrl = await uploadImage();
      } catch {
        setError("Gagal mengunggah foto. Coba tanpa foto atau ulangi.");
        setPhase("form");
        return;
      }

      const res = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          viewer_name: name,
          viewer_phone: phone,
          item_name: itemName,
          item_description: itemDesc || undefined,
          item_image_url: imageUrl,
          amount_budget: amountNum,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Gagal mengirim permintaan");
        setPhase("form");
        return;
      }

      const token: string | undefined = body.pay_token;
      if (!token) {
        setError("Terjadi kesalahan. Coba lagi.");
        setPhase("form");
        return;
      }
      setPayToken(token);
      setPhase("waiting_approval");
    } catch {
      setError("Terjadi kesalahan jaringan");
      setPhase("form");
    }
  }

  if (phase === "waiting_approval") {
    return (
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-indigo-800">
          Permintaan terkirim! ⏳
        </h2>
        <p className="mt-2 text-sm text-indigo-700">
          Menunggu persetujuan seller untuk {`"${itemName}"`}. Halaman ini akan
          otomatis memperbarui saat disetujui — kami juga kirim link pembayaran
          ke WhatsApp {phone}.
        </p>
      </div>
    );
  }

  if (phase === "approved" && payToken) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
          <h2 className="text-lg font-semibold text-green-800">
            Disetujui seller! ✅
          </h2>
          <p className="mt-2 text-sm text-green-700">
            Selesaikan pembayaran untuk {`"${itemName}"`}. Dana ditahan aman di
            escrow sampai barang kamu terima.
          </p>
        </div>
        <PayClient payToken={payToken} />
      </div>
    );
  }

  if (phase === "rejected") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-red-800">
          Permintaan belum disetujui
        </h2>
        <p className="mt-2 text-sm text-red-700">
          Maaf, seller belum bisa menyetujui request {`"${itemName}"`} saat ini.
          Kamu bisa mencoba membuat permintaan lain.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Nama kamu" htmlFor="name">
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama panggilan"
          maxLength={100}
          required
        />
      </Field>

      <Field
        label="Nomor WhatsApp"
        htmlFor="phone"
        hint="Untuk link pembayaran & konfirmasi. Contoh: 08123456789"
      >
        <Input
          id="phone"
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="08xxxxxxxxxx"
          required
        />
      </Field>

      <Field label="Barang yang dititip" htmlFor="item">
        <Input
          id="item"
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          placeholder="Contoh: Sepatu Nike ukuran 42"
          maxLength={200}
          required
        />
      </Field>

      <Field label="Catatan (opsional)" htmlFor="desc">
        <Textarea
          id="desc"
          value={itemDesc}
          onChange={(e) => setItemDesc(e.target.value)}
          placeholder="Warna, varian, atau detail lain"
          rows={2}
          maxLength={1000}
        />
      </Field>

      <Field label="Foto barang (opsional)" htmlFor="image">
        {prefillImageUrl && !imageFile ? (
          <div className="mb-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={prefillImageUrl}
              alt={itemName || "Barang"}
              className="h-14 w-14 rounded-lg object-cover"
            />
            <span className="text-xs text-zinc-500">
              Foto dari katalog. Pilih file untuk mengganti.
            </span>
          </div>
        ) : null}
        <input
          id="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
        />
      </Field>

      <Field
        label="Budget maksimal (Rp)"
        htmlFor="amount"
        hint={`Termasuk harga barang. Min ${rupiah(MIN_ORDER_AMOUNT)}.`}
      >
        <Input
          id="amount"
          type="number"
          inputMode="numeric"
          min={MIN_ORDER_AMOUNT}
          max={MAX_ORDER_AMOUNT}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="150000"
          required
        />
      </Field>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {uploading
          ? "Mengunggah foto…"
          : phase === "submitting"
            ? "Mengirim permintaan…"
            : "Kirim permintaan"}
      </Button>
    </form>
  );
}
