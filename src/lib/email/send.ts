/**
 * Outbound email.
 *
 * Folio had no way to send mail at all — `buildKindleEmail` only assembles a
 * MIME blob for the reader to forward themselves. Verification needs a real
 * send, so this is the one adapter for it.
 *
 * When no provider is configured the link is written to the server log instead
 * of thrown away, and `hasMailProvider()` returns false so callers can decide
 * not to gate on something they cannot deliver. Locking people out of a product
 * because an environment variable is missing is worse than not verifying.
 */

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendResult {
  delivered: boolean;
  provider: "resend" | "log";
  error?: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function fromAddress(): string {
  return (
    process.env.FOLIO_FROM_EMAIL?.trim() ||
    "Folio <onboarding@resend.dev>"
  );
}

/** Whether a real send is possible. Verification is only enforced when true. */
export function hasMailProvider(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendEmail(email: OutboundEmail): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    // Deliberately loud and complete: in development this line IS the email.
    console.info(
      `[email] no provider configured — would have sent to ${email.to}\n` +
        `        subject: ${email.subject}\n` +
        `        ${email.text.replace(/\n/g, "\n        ")}`
    );
    return { delivered: false, provider: "log" };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [email.to],
        subject: email.subject,
        text: email.text,
        ...(email.html ? { html: email.html } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        `[email] resend rejected the send: ${response.status} ${detail.slice(0, 300)}`
      );
      return {
        delivered: false,
        provider: "resend",
        error: `Provider returned ${response.status}`,
      };
    }
    return { delivered: true, provider: "resend" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email] send failed: ${message}`);
    return { delivered: false, provider: "resend", error: message };
  }
}
