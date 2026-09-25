"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";

type State = "idle" | "loading" | "done" | "error";

export default function ConfirmClient({ token }: { token: string }) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function confirm() {
    setState("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/orders/confirm-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMessage(body.error ?? "Gagal mengonfirmasi pesanan.");
        return;
      }
      setState("done");
      setMessage(body.message ?? "Terima kasih! Konfirmasi diterima.");
    } catch {
      setState("error");
      setMessage("Terjadi kesalahan jaringan.");
    }
  }

  return (
    <Card className="w-full max-w-md text-center">
      <span className="text-lg font-bold tracking-tight text-zinc-900">
        Jastip<span className="text-indigo-600">Live</span>
      </span>

      {state === "done" ? (
        <>
          <div className="mt-6 text-4xl">✅</div>
          <h1 className="mt-3 text-xl font-bold text-zinc-900">
            Konfirmasi diterima
          </h1>
          <p className="mt-2 text-sm text-zinc-600">{message}</p>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-xl font-bold text-zinc-900">
            Konfirmasi penerimaan barang
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Sudah menerima barang titipanmu? Tekan tombol di bawah untuk
            melepas dana dari escrow ke streamer.
          </p>

          {message ? (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {message}
            </p>
          ) : null}

          <Button
            size="lg"
            className="mt-6 w-full"
            onClick={confirm}
            disabled={state === "loading"}
          >
            {state === "loading" ? "Memproses…" : "Ya, saya sudah terima"}
          </Button>
          <p className="mt-3 text-xs text-zinc-400">
            Jika tidak dikonfirmasi, dana otomatis dilepas dalam 3 hari.
          </p>
        </>
      )}
    </Card>
  );
}
