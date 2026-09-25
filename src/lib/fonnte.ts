import "server-only";

// Fonnte WhatsApp gateway helper.
// Docs: POST https://api.fonnte.com/send, header `Authorization: <TOKEN>`
// (no "Bearer"), form body `target` + `message`.

const FONNTE_SEND_URL = "https://api.fonnte.com/send";

export interface SendWhatsAppResult {
  ok: boolean;
  status?: boolean;
  detail?: string;
  raw?: unknown;
}

/**
 * Send a WhatsApp text message via Fonnte.
 *
 * @param target  recipient number in `62...` form (see `normalizePhone`)
 * @param message message body
 *
 * Failures are returned (not thrown) so callers can decide whether a failed
 * notification should fail the whole request — usually it should not.
 */
export async function sendWhatsApp(
  target: string,
  message: string,
): Promise<SendWhatsAppResult> {
  const token = process.env.FONNTE_TOKEN;
  if (!token) {
    return { ok: false, detail: "FONNTE_TOKEN is not set" };
  }

  const body = new URLSearchParams({ target, message });

  try {
    const res = await fetch(FONNTE_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const raw = (await res.json().catch(() => null)) as
      | { status?: boolean; detail?: string; reason?: string }
      | null;

    if (!res.ok || !raw?.status) {
      return {
        ok: false,
        status: raw?.status,
        detail: raw?.detail ?? raw?.reason ?? `HTTP ${res.status}`,
        raw,
      };
    }

    return { ok: true, status: raw.status, detail: raw.detail, raw };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "network error" };
  }
}
