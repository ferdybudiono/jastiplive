"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ITEM_IMAGES_BUCKET,
  MAX_ORDER_AMOUNT,
  MIN_ORDER_AMOUNT,
} from "@/lib/constants";
import { rupiah } from "@/lib/format";
import { Button, Field, Input, Textarea } from "@/components/ui";

// Midtrans Snap.js is injected via <Script> on the page.
interface SnapCallbacks {
  onSuccess?: (result: unknown) => void;
  onPending?: (result: unknown) => void;
  onError?: (result: unknown) => void;
  onClose?: () => void;
}
declare global {
  interface Window {
    snap?: { pay: (token: string, callbacks?: SnapCallbacks) => void };
  }
}

type Phase = "form" | "submitting" | "paying" | "pending" | "done";

export default function CheckoutForm({ slug }: { slug: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);

  const busy = phase === "submitting" || phase === "paying" || uploading;

  async function uploadImage(): Promise<string | undefined> {
    if (!imageFile) return undefined;
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
        setError(body.error ?? "Gagal membuat pesanan");
        setPhase("form");
        return;
      }

      const token: string | undefined = body.snap_token;
      if (!token || !window.snap) {
        // Fallback: Snap not loaded — the WhatsApp link still lets them pay.
        setPhase("pending");
        return;
      }

      setPhase("paying");
      window.snap.pay(token, {
        onSuccess: () => setPhase("done"),
        onPending: () => setPhase("pending"),
        onError: () => {
          setError("Pembayaran gagal. Silakan coba lagi.");
          setPhase("form");
        },
        onClose: () =>
          setPhase((p) => (p === "done" ? "done" : "pending")),
      });
    } catch {
      setError("Terjadi kesalahan jaringan");
      setPhase("form");
    }
  }

  if (phase === "done") {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-green-800">
          Pembayaran diterima! 🎉
        </h2>
        <p className="mt-2 text-sm text-green-700">
          Danamu ditahan aman di escrow. {`"${itemName}"`} akan dibeli oleh
          streamer. Konfirmasi & update dikirim ke WhatsApp {phone}.
        </p>
      </div>
    );
  }

  if (phase === "pending") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-amber-800">
          Selesaikan pembayaranmu
        </h2>
        <p className="mt-2 text-sm text-amber-700">
          Kami sudah mengirim link pembayaran ke WhatsApp {phone}. Selesaikan
          pembayaran di sana untuk mengaktifkan pesanan.
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
            ? "Membuat pesanan…"
            : phase === "paying"
              ? "Membuka pembayaran…"
              : "Bayar sekarang"}
      </Button>
    </form>
  );
}
