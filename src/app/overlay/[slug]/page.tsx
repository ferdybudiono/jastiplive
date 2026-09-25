import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import type { PublicProfile } from "@/lib/types";
import OverlayClient from "@/components/overlay-client";

export const dynamic = "force-dynamic";

async function getStreamer(slug: string): Promise<PublicProfile | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.rpc("get_streamer_by_slug", { p_slug: slug });
  const row = Array.isArray(data) ? data[0] : data;
  return (row as PublicProfile) ?? null;
}

export default async function OverlayPage(props: PageProps<"/overlay/[slug]">) {
  const { slug } = await props.params;
  const streamer = await getStreamer(slug);
  if (!streamer) notFound();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const buyerUrl = `${appUrl}/${slug}`;

  return (
    <OverlayClient
      streamerId={streamer.id}
      buyerUrl={buyerUrl}
      slug={slug}
    />
  );
}
