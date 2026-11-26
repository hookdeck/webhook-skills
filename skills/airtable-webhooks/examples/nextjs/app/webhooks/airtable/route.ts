// Generated with: airtable-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest } from 'next/server';
import crypto from 'crypto';

/**
 * Verify an Airtable webhook notification signature.
 *
 * Airtable signs the raw body with HMAC-SHA256 keyed on the base64-DECODED
 * macSecretBase64 (returned once at webhook creation). The header value is
 * "hmac-sha256=" + hex(digest).
 */
export function verifyAirtableSignature(
  rawBody: string,
  macHeader: string | null,
  macSecretBase64: string
): boolean {
  if (!macHeader) return false;
  const key = Buffer.from(macSecretBase64, 'base64');
  const expected =
    'hmac-sha256=' + crypto.createHmac('sha256', key).update(rawBody, 'utf8').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(macHeader), Buffer.from(expected));
  } catch {
    return false; // length mismatch = invalid
  }
}

interface ChangedTable {
  createdRecordsById?: Record<string, unknown>;
  changedRecordsById?: Record<string, unknown>;
  destroyedRecordIds?: string[];
}

interface Payload {
  baseTransactionNumber?: number;
  actionMetadata?: { source?: string };
  changedTablesById?: Record<string, ChangedTable>;
}

/**
 * Summarize one payload from the payloads API into per-table counts. Pure function.
 */
export function summarizeChanges(payload: Payload) {
  const tables: Record<string, { created: number; changed: number; destroyed: number }> = {};
  for (const [tableId, change] of Object.entries(payload.changedTablesById || {})) {
    tables[tableId] = {
      created: Object.keys(change.createdRecordsById || {}).length,
      changed: Object.keys(change.changedRecordsById || {}).length,
      destroyed: (change.destroyedRecordIds || []).length,
    };
  }
  return {
    transactionNumber: payload.baseTransactionNumber,
    source: payload.actionMetadata?.source,
    tables,
  };
}

/**
 * Fetch changes from the webhook payloads API, paging until mightHaveMore is false.
 * Called after acknowledging the notification.
 */
export async function fetchPayloads(baseId: string, webhookId: string, cursor?: number) {
  const token = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
  const payloads: Payload[] = [];
  let nextCursor = cursor;

  do {
    const url = new URL(
      `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`
    );
    if (nextCursor != null) url.searchParams.set('cursor', String(nextCursor));
    url.searchParams.set('limit', '50'); // max allowed

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 30000)); // shares base's 5 req/s limit
      continue;
    }
    if (!res.ok) throw new Error(`Airtable payloads API returned ${res.status}`);

    const data = await res.json();
    payloads.push(...(data.payloads || []));
    nextCursor = data.cursor;
    if (!data.mightHaveMore) break;
  } while (true);

  return { payloads, cursor: nextCursor };
}

export async function POST(request: NextRequest) {
  // Read the RAW body for signature verification — do not parse first.
  const rawBody = await request.text();
  const mac = request.headers.get('x-airtable-content-mac');

  if (!verifyAirtableSignature(rawBody, mac, process.env.AIRTABLE_MAC_SECRET_BASE64!)) {
    console.error('Airtable signature verification failed');
    return new Response('Invalid signature', { status: 400 });
  }

  // Thin ping: only base.id, webhook.id, timestamp — no change data.
  const ping = JSON.parse(rawBody);
  const baseId = ping.base?.id;
  const webhookId = ping.webhook?.id;
  console.log(`Airtable notification for base=${baseId} webhook=${webhookId}`);

  // Fetch the actual changes. In production, do this in a background job/queue and
  // acknowledge first so you always respond within 25s. Persist the returned cursor.
  if (process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN) {
    try {
      const { payloads } = await fetchPayloads(baseId, webhookId /*, loadCursor(...) */);
      for (const payload of payloads) {
        console.log('Changes:', JSON.stringify(summarizeChanges(payload)));
        // Your code: dispatch on summary.tables / payload.actionMetadata.source
      }
    } catch (err) {
      console.error('Failed to fetch payloads:', err);
    }
  }

  // Acknowledge with an empty body.
  return new Response(null, { status: 200 });
}
