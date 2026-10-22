import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a SeaTable webhook signature.
 * Header: X-Seatable-Signature: sha256=<hex HMAC-SHA256 of the raw body>
 * The secret is used as a UTF-8 string key.
 */
function verifySeaTableWebhook(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const received = signatureHeader.replace(/^sha256=/, '').toLowerCase();
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; throws on length mismatch, which means invalid
  try {
    return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.SEATABLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SEATABLE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // request.text() returns the raw body whatever the content type
  const body = await request.text();
  const signature = request.headers.get('x-seatable-signature');

  if (!verifySeaTableWebhook(body, signature, secret)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification
  let payload: { event?: string; data?: Record<string, any> };
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // `event` is currently always "update"; `data.op_type` says what changed
  const data = payload.data ?? {};
  const rowCount = data.row_count ? ` (${data.row_count} rows)` : '';

  switch (data.op_type) {
    case 'insert_row':
    case 'create_row':
      console.log(`Row created in ${data.table_name}${rowCount}:`, data.row_id);
      // TODO: Sync the new row, notify, enrich, etc.
      break;

    case 'modify_row':
      console.log(`Row modified in ${data.table_name}${rowCount}:`, data.row_id);
      for (const change of data.row_data ?? []) {
        console.log(`  ${change.column_name}: ${JSON.stringify(change.old_value)} -> ${JSON.stringify(change.value)}`);
      }
      // TODO: React to column changes
      break;

    case 'delete_row':
      console.log(`Row deleted in ${data.table_name}${rowCount}:`, data.row_id);
      // TODO: Remove from downstream systems
      break;

    default:
      console.log(`Unhandled ${payload.event} op_type: ${data.op_type}`);
  }

  // SeaTable disables the webhook after 5 consecutive non-200 responses
  return NextResponse.json({ received: true });
}
