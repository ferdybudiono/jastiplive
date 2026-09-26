"use client";

import { useState } from "react";
import { rupiah } from "@/lib/format";
import CheckoutForm, { type CheckoutPrefill } from "@/components/checkout-form";
import type { PublicCatalogItem } from "@/lib/types";

/**
 * Buyer-facing profile section: a catalog grid (if the seller has items) above
 * the request form. Clicking an item prefills the form — the form is remounted
 * via a changing `key` so the new defaults take, while staying fully editable.
 */
export default function ProfileOrderSection({
  slug,
  catalog,
}: {
  slug: string;
  catalog: PublicCatalogItem[];
}) {
  const [prefill, setPrefill] = useState<CheckoutPrefill | undefined>(undefined);
  const [prefillKey, setPrefillKey] = useState(0);

  function pick(item: PublicCatalogItem) {
    setPrefill({
      item_name: item.name,
      item_description: item.description ?? undefined,
      item_image_url: item.image_url ?? undefined,
      amount: item.price ?? undefined,
    });
    setPrefillKey((k) => k + 1);
    // Bring the form into view on mobile.
    if (typeof document !== "undefined") {
      document
        .getElementById("request-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div className="space-y-6">
      {catalog.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold text-zinc-900">
            Katalog barang
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Ketuk barang untuk mengisi form otomatis.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {catalog.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => pick(item)}
                className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left transition hover:border-indigo-300 hover:shadow-sm"
              >
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center bg-zinc-100 text-3xl">
                    🛍️
                  </div>
                )}
                <div className="p-3">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {item.name}
                  </p>
                  {item.price ? (
                    <p className="mt-0.5 text-sm font-semibold text-indigo-600">
                      {rupiah(item.price)}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-zinc-400">
                      Harga menyusul
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div id="request-form">
        <CheckoutForm key={prefillKey} slug={slug} prefill={prefill} />
      </div>
    </div>
  );
}
