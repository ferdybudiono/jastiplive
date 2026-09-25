"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input } from "@/components/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          slug,
          display_name: displayName,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Gagal mendaftar");
        return;
      }
      // Account created — sign in and go to the dashboard.
      const supabase = createClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInErr) {
        router.push("/login");
        return;
      }
      router.push("/dashboard/orders");
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-zinc-900"
        >
          Jastip<span className="text-indigo-600">Live</span>
        </Link>
        <h1 className="mt-6 text-2xl font-bold text-zinc-900">Daftar gratis</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Buat akun streamer dan pilih link jastip-mu.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="Nama tampilan" htmlFor="display_name">
            <Input
              id="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Toko Sepatu Andi"
              required
            />
          </Field>

          <Field
            label="Link jastip"
            htmlFor="slug"
            hint="Halamanmu: jastip.live/nama-ini (huruf kecil, angka, tanda hubung)"
          >
            <div className="flex items-center rounded-lg border border-zinc-300 bg-white pl-3 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-200">
              <span className="text-sm text-zinc-400">jastip.live/</span>
              <input
                id="slug"
                value={slug}
                onChange={(e) =>
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                }
                placeholder="tokoandi"
                className="h-11 flex-1 bg-transparent px-1 text-sm text-zinc-900 focus:outline-none"
                required
              />
            </div>
          </Field>

          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="kamu@email.com"
              required
            />
          </Field>

          <Field label="Password" htmlFor="password" hint="Minimal 8 karakter">
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </Field>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "Memproses…" : "Daftar"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-zinc-500">
          Sudah punya akun?{" "}
          <Link href="/login" className="font-medium text-indigo-600">
            Masuk
          </Link>
        </p>
      </Card>
    </div>
  );
}
