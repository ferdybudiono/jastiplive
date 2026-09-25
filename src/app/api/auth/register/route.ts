import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { registerSchema } from "@/lib/validation";
import { isValidSlug } from "@/lib/constants";
import { clientIp, rateLimit } from "@/lib/ratelimit";

// Streamer registration. Creates a confirmed auth user + profile atomically
// via the service role, so the client can sign in immediately afterward
// (no email-confirmation round-trip needed for this B2B onboarding).
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Data tidak valid" },
      { status: 422 },
    );
  }
  const { email, password, slug, display_name } = parsed.data;

  // Block reserved slugs that would collide with system routes.
  if (!isValidSlug(slug)) {
    return NextResponse.json(
      { error: "Slug ini tidak tersedia. Pilih nama lain." },
      { status: 409 },
    );
  }

  const limit = rateLimit(`register:${clientIp(request)}`, 5, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }

  const supabase = createServiceClient();

  // Is the slug already taken?
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "Slug ini sudah dipakai. Pilih nama lain." },
      { status: 409 },
    );
  }

  // Create the auth user (email pre-confirmed for immediate sign-in).
  const { data: created, error: createErr } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createErr || !created?.user) {
    const already = createErr?.message?.toLowerCase().includes("already");
    return NextResponse.json(
      {
        error: already
          ? "Email sudah terdaftar. Silakan masuk."
          : "Gagal membuat akun",
      },
      { status: already ? 409 : 500 },
    );
  }

  // Create the profile row keyed to the new user id.
  const { error: profileErr } = await supabase.from("profiles").insert({
    id: created.user.id,
    slug,
    display_name,
  });

  if (profileErr) {
    // Roll back the orphaned auth user so the email/slug can be retried.
    await supabase.auth.admin.deleteUser(created.user.id);
    const dupSlug = profileErr.message?.toLowerCase().includes("slug");
    return NextResponse.json(
      { error: dupSlug ? "Slug ini sudah dipakai." : "Gagal membuat profil" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
