"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import type { CheckoutPayResponse } from "@/lib/types";

// Midtrans Snap.js is injected via <Script> on the host page.
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

type PayPhase = "idle" | "loading" | "paying" | "pending" | "done";

/**
 * Shared "Bayar sekarang" button for an APPROVED order. Mints a fresh Snap
 * token via /api/checkout/pay (amount comes from the stored row, never the
 * client) and opens the Snap popup. Used inline in the buyer's request screen
 * after approval, and standalone on the /pay/[token] WhatsApp-fallback page.
 */
export default function PayClient({ payToken }: { payToken: string }) {
  const [phase, setPhase] = useState<PayPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setError(null);
    setPhase("loading");
    try {
      const res = await fetch("/api/checkout/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pay_token: payToken }),
      });
      const body = (await res.json().catch(() => ({}))) as
        | CheckoutPayResponse
        | { error?: string };
      if (!res.ok || !("snap_token" in body) || !body.snap_token) {
        setError(("error" in body && body.error) || "Gagal membuat pembayaran");
        setPhase("idle");
        return;
      }

      if (!window.snap) {
        // Snap.js not loaded yet — ask them to retry.
        setError("Pembayaran belum siap. Muat ulang halaman lalu coba lagi.");
        setPhase("idle");
        return;
      }

      setPhase("paying");
      window.snap.pay(body.snap_token, {
        onSuccess: () => setPhase("done"),
        onPending: () => setPhase("pending"),
        onError: () => {
          setError("Pembayaran gagal. Silakan coba lagi.");
          setPhase("idle");
        },
        onClose: () => setPhase((p) => (p === "done" ? "done" : "idle")),
      });
    } catch {
      setError("Terjadi kesalahan jaringan");
      setPhase("idle");
    }
  }

  if (phase === "done") {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-green-800">
          Pembayaran diterima! 🎉
        </h2>
        <p className="mt-2 text-sm text-green-700">
          Danamu ditahan aman di escrow sampai barang kamu terima.
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
          Pembayaran belum selesai. Klik lagi untuk melanjutkan.
        </p>
        <div className="mt-4">
          <Button onClick={pay}>Lanjutkan pembayaran</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        size="lg"
        className="w-full"
        onClick={pay}
        disabled={phase === "loading" || phase === "paying"}
      >
        {phase === "loading"
          ? "Menyiapkan pembayaran…"
          : phase === "paying"
            ? "Membuka pembayaran…"
            : "Bayar sekarang"}
      </Button>
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
