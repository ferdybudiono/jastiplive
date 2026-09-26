"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ITEM_IMAGES_BUCKET, MAX_ORDER_AMOUNT } from "@/lib/constants";
import { rupiah } from "@/lib/format";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import type { CatalogItem } from "@/lib/types";

export default function CatalogManager({
  streamerId,
  initialItems,
}: {
  streamerId: string;
  initialItems: CatalogItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<CatalogItem[]>(initialItems);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setDescription("");
    setPrice("");
    setImageFile(null);
  }

  async function uploadImage(): Promise<string | null> {
    if (!imageFile) return null;
    const supabase = createClient();
    const ext = imageFile.name.split(".").pop() ?? "jpg";
    const path = `${streamerId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(ITEM_IMAGES_BUCKET)
      .upload(path, imageFile, { upsert: false });
    if (upErr) throw upErr;
    const { data } = supabase.storage
      .from(ITEM_IMAGES_BUCKET)
      .getPublicUrl(path);
    return data.publicUrl;
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Nama barang wajib diisi.");
      return;
    }
    let priceNum: number | null = null;
    if (price.trim()) {
      const n = Math.round(Number(price));
      if (!Number.isFinite(n) || n <= 0 || n > MAX_ORDER_AMOUNT) {
        setError("Harga tidak valid.");
        return;
      }
      priceNum = n;
    }

    setBusy(true);
    try {
      let imageUrl: string | null = null;
      try {
        imageUrl = await uploadImage();
      } catch {
        setError("Gagal mengunggah foto. Coba tanpa foto atau ulangi.");
        return;
      }

      const supabase = createClient();
      // RLS ensures streamer_id must equal auth.uid().
      const { data, error: insErr } = await supabase
        .from("catalog_items")
        .insert({
          streamer_id: streamerId,
          name: name.trim(),
          description: description.trim() || null,
          image_url: imageUrl,
          price: priceNum,
        })
        .select("*")
        .single<CatalogItem>();

      if (insErr || !data) {
        setError("Gagal menambah barang.");
        return;
      }
      setItems((prev) => [...prev, data]);
      resetForm();
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: string) {
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: delErr } = await supabase
        .from("catalog_items")
        .delete()
        .eq("id", id);
      if (delErr) {
        setError("Gagal menghapus barang.");
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(item: CatalogItem) {
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: updErr } = await supabase
        .from("catalog_items")
        .update({ is_active: !item.is_active })
        .eq("id", item.id);
      if (updErr) {
        setError("Gagal memperbarui barang.");
        return;
      }
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, is_active: !i.is_active } : i,
        ),
      );
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Add form */}
      <Card className="space-y-4">
        <h2 className="text-base font-semibold text-zinc-900">Tambah barang</h2>
        <form onSubmit={addItem} className="space-y-4">
          <Field label="Nama barang" htmlFor="cat_name">
            <Input
              id="cat_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Skincare varian A"
              maxLength={200}
              required
            />
          </Field>
          <Field label="Deskripsi (opsional)" htmlFor="cat_desc">
            <Textarea
              id="cat_desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Varian, ukuran, atau catatan"
              rows={2}
              maxLength={1000}
            />
          </Field>
          <Field
            label="Harga saran (opsional, Rp)"
            htmlFor="cat_price"
            hint="Ditampilkan ke buyer sebagai perkiraan budget."
          >
            <Input
              id="cat_price"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_ORDER_AMOUNT}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="150000"
            />
          </Field>
          <Field label="Foto (opsional)" htmlFor="cat_image">
            <input
              id="cat_image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
            />
          </Field>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={busy}>
            {busy ? "Menyimpan…" : "Tambah ke katalog"}
          </Button>
        </form>
      </Card>

      {/* Existing items */}
      <div>
        <h2 className="text-base font-semibold text-zinc-900">
          Barang di katalog ({items.length})
        </h2>
        {items.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
            <p className="text-sm text-zinc-500">
              Belum ada barang. Tambahkan barang pertamamu di atas.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3"
              >
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xl">
                    🛍️
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {item.name}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {item.price ? rupiah(item.price) : "Harga menyusul"}
                    {!item.is_active ? " · disembunyikan" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => toggleActive(item)}
                    disabled={busy}
                  >
                    {item.is_active ? "Sembunyikan" : "Tampilkan"}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => removeItem(item.id)}
                    disabled={busy}
                  >
                    Hapus
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
