import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { escrowReleaseSchema } from "@/lib/validation";
import { releaseOrder } from "@/lib/escrow";

// Streamer-initiated escrow release from the dashboard. Auth = streamer
// session; the release routine is scoped to the owning streamer so a streamer
// can never release another streamer's order.
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = escrowReleaseSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Data tidak valid" },
      { status: 422 },
    );
  }

  const authClient = await createClient();
  const { data: authData } = await authClient.auth.getClaims();
  const claims = authData?.claims;
  if (!claims) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const streamerId = claims.sub as string;

  // Pass streamerId so the atomic claim also requires ownership.
  const result = await releaseOrder(parsed.data.order_id, streamerId);
  return NextResponse.json(
    result.ok ? { ok: true, message: result.message } : { error: result.message },
    { status: result.status },
  );
}
