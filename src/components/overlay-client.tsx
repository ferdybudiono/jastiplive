"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { rupiah } from "@/lib/format";

interface OrderEvent {
  id: string;
  viewer_name: string | null;
  item_name: string;
  amount_budget: number;
}

const QR_SRC = (data: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data=${encodeURIComponent(data)}`;

export default function OverlayClient({
  streamerId,
  buyerUrl,
}: {
  streamerId: string;
  buyerUrl: string;
  slug: string;
}) {
  const [card, setCard] = useState<OrderEvent | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Transparent canvas for OBS browser sources.
  useEffect(() => {
    document.body.classList.add("overlay-transparent");
    return () => document.body.classList.remove("overlay-transparent");
  }, []);

  function chime() {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!audioCtx.current) audioCtx.current = new Ctx();
      const ctx = audioCtx.current;
      const now = ctx.currentTime;
      [880, 1320].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = now + i * 0.18;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.4);
      });
    } catch {
      // Autoplay blocked in browser preview until user interacts; OBS is fine.
    }
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`overlay:${streamerId}`)
      .on("broadcast", { event: "new_order" }, ({ payload }) => {
        const order = payload as OrderEvent;
        setCard(order);
        chime();
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setCard(null), 12_000);
      })
      .subscribe();

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      supabase.removeChannel(channel);
    };
  }, [streamerId]);

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Floating QR to the buyer page (bottom-right) */}
      <div className="absolute bottom-6 right-6 flex flex-col items-center rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={QR_SRC(buyerUrl)}
          alt="Scan untuk titip"
          width={160}
          height={160}
          className="rounded-lg"
        />
        <p className="mt-2 text-center text-sm font-bold text-zinc-900">
          📱 Scan untuk titip!
        </p>
      </div>

      {/* New-order alert card (top-center, animated) */}
      {card ? (
        <div
          key={card.id}
          className="absolute left-1/2 top-8 w-[440px] -translate-x-1/2 animate-[slidein_0.4s_ease-out]"
        >
          <div className="rounded-2xl border-4 border-emerald-400 bg-gradient-to-br from-indigo-600 to-indigo-800 p-5 text-white shadow-2xl">
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-emerald-300">
              <span>🛍️ JASTIP LUNAS</span>
            </div>
            <p className="mt-2 truncate text-2xl font-extrabold">
              {card.viewer_name ?? "Seseorang"}
            </p>
            <p className="mt-1 text-base text-indigo-100">
              titip: <span className="font-semibold">{card.item_name}</span>
            </p>
            <p className="mt-3 inline-block rounded-lg bg-emerald-400 px-3 py-1 text-lg font-extrabold text-emerald-950">
              {rupiah(card.amount_budget)}
            </p>
          </div>
        </div>
      ) : null}

      <style>{`
        @keyframes slidein {
          0% { transform: translate(-50%, -120%); opacity: 0; }
          100% { transform: translate(-50%, 0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
