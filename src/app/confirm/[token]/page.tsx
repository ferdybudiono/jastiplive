import ConfirmClient from "@/components/confirm-client";

export const dynamic = "force-dynamic";

export default async function ConfirmPage(
  props: PageProps<"/confirm/[token]">,
) {
  const { token } = await props.params;
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <ConfirmClient token={token} />
    </div>
  );
}
