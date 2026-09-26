"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RECEIPTS_BUCKET } from "@/lib/constants";
import { rupiah } from "@/lib/format";
import { Button } from "@/components/ui";
import type { JastipOrder } from "@/lib/types";

export default function OrderCard({
  order,
  statusLabel,
  statusClass,
}: {
  order: JastipOrder;
  statusLabel: string;
  statusClass: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);

  async function markPurchased() {
    setError(null);
    if (!receipt) {
      setError("Unggah foto struk dulu.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const ext = receipt.name.split(".").pop() ?? "jpg";
      const path = `${order.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(path, receipt, { upsert: false });
      if (upErr) {
        setError("Gagal mengunggah struk.");
        return;
      }
      const { data: pub } = supabase.storage
        .from(RECEIPTS_BUCKET)
        .getPublicUrl(path);

      const res = await fetch("/api/orders/mark-purchased", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: order.id,
          receipt_image_url: pub.publicUrl,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Gagal menandai dibeli");
        return;
      }
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan");
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/escrow/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Gagal mencairkan dana");
        return;
      }
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan");
    } finally {
      setBusy(false);
    }
  }

  async function decide(action: "approve" | "reject") {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          body.error ??
            (action === "approve" ? "Gagal menyetujui" : "Gagal menolak"),
        );
        return;
      }
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-zinc-900">
            {order.item_name}
          </p>
          <p className="mt-0.5 text-sm text-zinc-500">
            {order.viewer_name ?? "Pembeli"}
            {order.viewer_phone ? ` · ${order.viewer_phone}` : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusClass}`}
        >
          {statusLabel}
        </span>
      </div>

      {order.item_description ? (
        <p className="mt-2 text-sm text-zinc-600">{order.item_description}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span className="text-zinc-500">
          Budget:{" "}
          <span className="font-medium text-zinc-900">
            {rupiah(order.amount_budget)}
          </span>
        </span>
        <span className="text-zinc-500">
          Komisi: <span className="font-medium">{rupiah(order.platform_fee)}</span>
        </span>
        <span className="text-zinc-500">
          Diterima:{" "}
          <span className="font-medium text-green-700">
            {rupiah(order.streamer_payout_amount)}
          </span>
        </span>
      </div>

      {/* Actions per status */}
      {order.status === "pending_approval" ? (
        <div className="mt-4 border-t border-zinc-100 pt-4">
          <p className="mb-2 text-sm font-medium text-zinc-700">
            Permintaan baru — setujui untuk mengirim link pembayaran ke buyer.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => decide("approve")}
              disabled={busy}
            >
              {busy ? "Memproses…" : "Setujui"}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => decide("reject")}
              disabled={busy}
            >
              Tolak
            </Button>
          </div>
        </div>
      ) : null}

      {order.status === "pending_payment" ? (
        <p className="mt-3 border-t border-zinc-100 pt-3 text-sm text-zinc-600">
          Disetujui — menunggu pembayaran dari buyer.
        </p>
      ) : null}

      {order.status === "rejected" ? (
        <p className="mt-3 border-t border-zinc-100 pt-3 text-sm text-red-600">
          Permintaan ini ditolak.
        </p>
      ) : null}

      {order.status === "held_in_escrow" ? (
        <div className="mt-4 border-t border-zinc-100 pt-4">
          <p className="mb-2 text-sm font-medium text-zinc-700">
            Sudah beli barangnya? Unggah struk untuk mulai proses.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
              className="text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700"
            />
            <Button size="sm" onClick={markPurchased} disabled={busy}>
              {busy ? "Memproses…" : "Tandai sudah dibeli"}
            </Button>
          </div>
        </div>
      ) : null}

      {order.status === "purchased" ? (
        <div className="mt-4 border-t border-zinc-100 pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-zinc-600">
              Menunggu konfirmasi pembeli (otomatis cair dalam 3 hari).
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={release}
              disabled={busy}
            >
              {busy ? "Memproses…" : "Cairkan sekarang"}
            </Button>
          </div>
          {order.payout_status === "failed" ? (
            <p className="mt-2 text-xs text-red-600">
              Pencairan sebelumnya gagal (mungkin saldo belum settle). Coba lagi.
            </p>
          ) : null}
        </div>
      ) : null}

      {order.status === "completed" ? (
        <p className="mt-3 border-t border-zinc-100 pt-3 text-sm text-green-700">
          ✓ Dana sudah dicairkan ke rekeningmu.
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
