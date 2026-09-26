// Shared formatting helpers.

/** Format an integer-rupiah amount as "Rp 1.234.567". */
export function rupiah(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

/** Human-readable Indonesian label for each order status. */
export const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Menunggu persetujuan",
  pending_payment: "Menunggu pembayaran",
  held_in_escrow: "Dana di escrow",
  purchased: "Sudah dibeli",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  rejected: "Ditolak",
  refunded: "Dikembalikan",
};
