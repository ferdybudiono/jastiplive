import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { releaseOrder } from "@/lib/escrow";
import { AUTO_RELEASE_DAYS } from "@/lib/constants";
import type { JastipOrder } from "@/lib/types";

// Vercel Cron auto-release. Releases escrow for `purchased` orders whose 3-day
// confirmation window has elapsed without the buyer confirming.
// Auth = shared secret in the Authorization header (Vercel Cron sends
// `Authorization: Bearer $CRON_SECRET`).

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  // timingSafeEqual requires equal-length buffers.
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run() {
  const supabase = createServiceClient();

  const cutoff = new Date(
    Date.now() - AUTO_RELEASE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: due, error } = await supabase
    .from("jastip_orders")
    .select("id")
    .eq("status", "purchased")
    .lt("purchased_at", cutoff)
    .limit(100)
    .returns<Pick<JastipOrder, "id">[]>();

  if (error) {
    return NextResponse.json({ error: "Query gagal" }, { status: 500 });
  }

  let released = 0;
  let failed = 0;
  for (const order of due ?? []) {
    // releaseOrder is idempotent (atomic claim) — safe if a duplicate cron run
    // overlaps. No streamerId: the cron acts on behalf of the system.
    const result = await releaseOrder(order.id);
    if (result.ok) released += 1;
    else failed += 1;
  }

  return NextResponse.json({ ok: true, scanned: due?.length ?? 0, released, failed });
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return run();
}

// Vercel Cron issues GET by default; support both.
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return run();
}
