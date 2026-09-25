import "server-only";
import { createHash, timingSafeEqual } from "crypto";

// Midtrans helper: Snap (inbound QRIS/VA), Core status API, and Iris (payout).
// Base hosts differ by product: Snap uses `app.`, Core status uses `api.`,
// Iris lives under `app.../iris/api/v1`. Sandbox swaps in the `.sandbox.` host.

const IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === "true";

const SNAP_BASE = IS_PRODUCTION
  ? "https://app.midtrans.com"
  : "https://app.sandbox.midtrans.com";
const CORE_BASE = IS_PRODUCTION
  ? "https://api.midtrans.com"
  : "https://api.sandbox.midtrans.com";
const IRIS_BASE = IS_PRODUCTION
  ? "https://app.midtrans.com/iris/api/v1"
  : "https://app.sandbox.midtrans.com/iris/api/v1";

export class MidtransError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "MidtransError";
    this.status = status;
    this.payload = payload;
  }
}

function basicAuth(key: string): string {
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

// ---------------------------------------------------------------------------
// Snap (inbound payment)
// ---------------------------------------------------------------------------

export interface CreateSnapParams {
  orderId: string;
  grossAmount: number; // whole rupiah
  customerName: string;
  customerPhone: string; // 62... form
  itemName: string;
  enabledPayments?: string[];
  finishUrl?: string;
}

export interface SnapTransaction {
  token: string;
  redirect_url: string;
}

export async function createSnapTransaction(
  params: CreateSnapParams,
): Promise<SnapTransaction> {
  const [firstName, ...rest] = params.customerName.trim().split(/\s+/);
  const lastName = rest.join(" ");

  const body = {
    transaction_details: {
      order_id: params.orderId,
      gross_amount: params.grossAmount,
    },
    item_details: [
      {
        id: params.orderId,
        price: params.grossAmount,
        quantity: 1,
        name: truncate(params.itemName, 50),
      },
    ],
    customer_details: {
      first_name: truncate(firstName || "Pembeli", 50),
      ...(lastName ? { last_name: truncate(lastName, 50) } : {}),
      phone: params.customerPhone,
    },
    enabled_payments:
      params.enabledPayments ?? ["qris", "bank_transfer", "gopay", "shopeepay"],
    ...(params.finishUrl ? { callbacks: { finish: params.finishUrl } } : {}),
  };

  const res = await fetch(`${SNAP_BASE}/snap/v1/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: basicAuth(requireEnv("MIDTRANS_SERVER_KEY")),
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as
    | (SnapTransaction & { error_messages?: string[] })
    | null;

  if (!res.ok || !json?.token) {
    throw new MidtransError("Snap transaction create failed", res.status, json);
  }
  return { token: json.token, redirect_url: json.redirect_url };
}

// ---------------------------------------------------------------------------
// Webhook signature + status
// ---------------------------------------------------------------------------

export interface MidtransNotification {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status: string;
  fraud_status?: string;
  payment_type?: string;
  transaction_id?: string;
}

/** Verify a Midtrans HTTP notification: SHA512(order_id+status_code+gross_amount+server_key). */
export function verifyWebhookSignature(n: {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
}): boolean {
  const expected = createHash("sha512")
    .update(
      `${n.order_id}${n.status_code}${n.gross_amount}${requireEnv("MIDTRANS_SERVER_KEY")}`,
    )
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(n.signature_key ?? "", "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Fetch authoritative transaction status from the Core API (confirmation). */
export async function getTransactionStatus(
  orderId: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${CORE_BASE}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: {
      Accept: "application/json",
      Authorization: basicAuth(requireEnv("MIDTRANS_SERVER_KEY")),
    },
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) {
    throw new MidtransError("Status fetch failed", res.status, json);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Iris (payout / disbursement)
// ---------------------------------------------------------------------------

export interface CreatePayoutParams {
  beneficiaryName: string;
  beneficiaryAccount: string;
  beneficiaryBank: string;
  amount: number; // whole rupiah
  notes: string;
  beneficiaryEmail?: string;
}

export interface IrisPayoutResult {
  reference_no: string;
  status: string;
}

/** Create a single payout via Iris (Creator key). Returns the reference_no. */
export async function createIrisPayout(
  p: CreatePayoutParams,
): Promise<IrisPayoutResult> {
  const body = {
    payouts: [
      {
        beneficiary_name: p.beneficiaryName,
        beneficiary_account: p.beneficiaryAccount,
        beneficiary_bank: p.beneficiaryBank,
        amount: String(p.amount),
        notes: truncate(p.notes, 100),
        ...(p.beneficiaryEmail ? { beneficiary_email: p.beneficiaryEmail } : {}),
      },
    ],
  };

  const res = await fetch(`${IRIS_BASE}/payouts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: basicAuth(requireEnv("MIDTRANS_IRIS_CREATOR_KEY")),
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as {
    payouts?: Array<{ status?: string; reference_no?: string }>;
  } | null;

  const first = json?.payouts?.[0];
  if (!res.ok || !first?.reference_no) {
    throw new MidtransError("Iris payout create failed", res.status, json);
  }
  return { reference_no: first.reference_no, status: first.status ?? "queued" };
}

/** Approve queued payouts (Approver key). OTP is account-dependent. */
export async function approveIrisPayout(
  referenceNos: string[],
  otp?: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${IRIS_BASE}/payouts/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: basicAuth(requireEnv("MIDTRANS_IRIS_APPROVER_KEY")),
    },
    body: JSON.stringify({ reference_nos: referenceNos, ...(otp ? { otp } : {}) }),
  });

  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    throw new MidtransError("Iris payout approve failed", res.status, json);
  }
  return json ?? {};
}

/** Validate a bank account before payout (Iris account_validation). */
export async function validateBankAccount(
  bank: string,
  account: string,
): Promise<Record<string, unknown>> {
  const url = `${IRIS_BASE}/account_validation?bank=${encodeURIComponent(bank)}&account=${encodeURIComponent(account)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: basicAuth(requireEnv("MIDTRANS_IRIS_CREATOR_KEY")),
    },
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) {
    throw new MidtransError("Account validation failed", res.status, json);
  }
  return json;
}
