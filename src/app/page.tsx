import Link from "next/link";
import { Button } from "@/components/ui";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Nav */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <span className="text-lg font-bold tracking-tight text-zinc-900">
          Jastip<span className="text-indigo-600">Live</span>
        </span>
        <nav className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Masuk
            </Button>
          </Link>
          <Link href="/register">
            <Button size="sm">Daftar gratis</Button>
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-6 py-16 text-center sm:py-24">
        <span className="mb-4 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
          Untuk streamer TikTok, Shopee &amp; Instagram Live
        </span>
        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-5xl">
          Terima jastip dari penonton live-mu, dibayar dengan aman.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-zinc-600">
          Penonton titip barang &amp; bayar instan lewat QRIS. Dana ditahan di
          escrow sampai barang dibeli — lalu dicairkan otomatis ke rekeningmu.
          Kamu fokus jualan, kami urus pembayarannya.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/register">
            <Button size="lg">Mulai gratis — potong 5%</Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary" size="lg">
              Saya sudah punya akun
            </Button>
          </Link>
        </div>
        <p className="mt-4 text-sm text-zinc-500">
          Tanpa biaya bulanan. Komisi 5% hanya dari pesanan yang berhasil.
        </p>
      </section>

      {/* How it works */}
      <section className="border-y border-zinc-200 bg-white py-16">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 sm:grid-cols-3">
          {[
            {
              step: "1",
              title: "Bagikan link jastip-mu",
              body: "Setiap streamer punya halaman unik (jastip.live/namamu). Tempel di bio atau tampilkan di overlay live.",
            },
            {
              step: "2",
              title: "Penonton titip & bayar",
              body: "Tanpa login. Isi nama, WhatsApp, barang, dan budget, lalu bayar QRIS. Dana langsung masuk escrow.",
            },
            {
              step: "3",
              title: "Beli & cairkan otomatis",
              body: "Upload struk setelah beli. Pembeli konfirmasi (atau otomatis 3 hari), dana cair ke rekeningmu.",
            },
          ].map((s) => (
            <div key={s.step}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                {s.step}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-zinc-900">
                {s.title}
              </h3>
              <p className="mt-2 text-sm text-zinc-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto grid w-full max-w-5xl gap-6 px-6 py-16 sm:grid-cols-2">
        {[
          {
            title: "Pembayaran aman (escrow)",
            body: "Dana penonton ditahan sistem sampai barang benar-benar dibeli. Mengurangi risiko penipuan di kedua sisi.",
          },
          {
            title: "Overlay live otomatis",
            body: "Pesanan baru muncul sebagai kartu animasi di OBS-mu lengkap dengan nama penitip & budget.",
          },
          {
            title: "Notifikasi WhatsApp",
            body: "Pembeli otomatis dapat link pembayaran & konfirmasi lewat WhatsApp. Tanpa aplikasi tambahan.",
          },
          {
            title: "Pencairan otomatis",
            body: "Payout langsung ke rekening bankmu via Midtrans Iris. Komisi 5% transparan di setiap pesanan.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-zinc-200 bg-white p-6"
          >
            <h3 className="text-base font-semibold text-zinc-900">{f.title}</h3>
            <p className="mt-2 text-sm text-zinc-600">{f.body}</p>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-20">
        <div className="rounded-3xl bg-indigo-600 px-8 py-12 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Siap terima jastip dengan aman?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-indigo-100">
            Daftar dalam 1 menit, pilih nama link-mu, dan mulai terima titipan
            dari penonton live hari ini.
          </p>
          <Link href="/register" className="mt-6 inline-block">
            <Button variant="secondary" size="lg">
              Daftar gratis
            </Button>
          </Link>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-5xl px-6 py-8 text-center text-sm text-zinc-500">
        © {new Date().getFullYear()} JastipLive. Dibuat untuk kreator Indonesia.
      </footer>
    </div>
  );
}
