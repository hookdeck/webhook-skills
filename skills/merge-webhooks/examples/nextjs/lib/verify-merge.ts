// Generated with: merge-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Merge signs every webhook with X-Merge-Webhook-Signature: the HMAC-SHA256
// of the raw body, encoded as base64url WITH '=' padding (44 characters).
// The key is your organization's signature key, used as UTF-8 text.
// Padding carries no data, so it's ignored on both sides of the comparison.

export interface MergeWebhookPayload {
  hook?: { id?: string; event?: string; target?: string };
  linked_account?: { id?: string; integration?: string; integration_slug?: string; category?: string; [key: string]: unknown };
  data?: Record<string, unknown>;
  async_passthrough_receipt_id?: string;
}

/** Verify X-Merge-Webhook-Signature against the exact bytes Merge sent. */
export function verifyMergeSignature(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  key: string | null | undefined
): boolean {
  const secret = String(key ?? '').trim();
  const value = String(signature ?? '').trim();
  // 32 bytes = 43 base64url characters, plus one optional '='.
  if (!secret || !/^[A-Za-z0-9_-]{43}=?$/.test(value)) return false;
  const given = Buffer.from(value.replace(/=$/, ''));
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('base64url'));
  return crypto.timingSafeEqual(given, expected);
}

export function handleMergeEvent(payload: MergeWebhookPayload) {
  const event = payload.hook?.event ?? '';
  const accountId = payload.linked_account?.id ?? null;
  if (event === 'LinkedAccount.deleted') {
    console.log(`Linked account ${accountId} deleted: drop its data`);
  } else if (/\.(added|changed|removed)$/.test(event)) {
    console.log(`${event}: ${String(payload.data?.id)}`);
  } else {
    console.log(`Merge event: ${event}`);
  }
  return { received: true, event, linked_account_id: accountId };
}
