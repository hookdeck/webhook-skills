// Generated with: smartsheet-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

interface SmartsheetEvent {
  objectType: string;
  eventType: string;
  id?: number;
  rowId?: number;
  columnId?: number;
  userId?: number;
}

// Smartsheet-Hmac-SHA256 = hex HMAC-SHA256 of the raw body, keyed with the
// webhook's sharedSecret. Compare case-insensitively.
function verifySmartsheetSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = Buffer.from(signatureHeader.trim().toLowerCase());
  const expectedBuf = Buffer.from(expected);
  return received.length === expectedBuf.length && crypto.timingSafeEqual(received, expectedBuf);
}

function handleEvent(event: SmartsheetEvent) {
  switch (`${event.objectType}.${event.eventType}`) {
    case 'row.created':
      console.log('Row created:', event.id);
      // TODO: Fetch the row via the API (callbacks are "skinny") and process it
      break;
    case 'row.updated':
      console.log('Row updated:', event.id);
      break;
    case 'row.deleted':
      console.log('Row deleted:', event.id);
      break;
    case 'cell.updated':
      console.log('Cell updated: row', event.rowId, 'column', event.columnId);
      break;
    case 'sheet.updated':
      console.log('Sheet updated:', event.id);
      break;
    default:
      console.log(`Unhandled event: ${event.objectType}.${event.eventType}`);
  }
}

export async function POST(request: NextRequest) {
  // 1. Verification handshake FIRST: Smartsheet sends it on enable and again
  //    about every 100 callbacks. Challenge requests may be unsigned, so echo
  //    the value before any signature check.
  const challenge = request.headers.get('Smartsheet-Hook-Challenge');
  if (challenge) {
    return NextResponse.json(
      { smartsheetHookResponse: challenge },
      { status: 200, headers: { 'Smartsheet-Hook-Response': challenge } }
    );
  }

  // 2. Verify the signature over the raw body (text() before any JSON parsing)
  const signature = request.headers.get('Smartsheet-Hmac-SHA256');
  if (!signature) {
    return new NextResponse('Missing Smartsheet-Hmac-SHA256 header', { status: 400 });
  }
  const rawBody = await request.text();
  if (!verifySmartsheetSignature(rawBody, signature, process.env.SMARTSHEET_SHARED_SECRET)) {
    console.error('Smartsheet webhook signature verification failed');
    return new NextResponse('Invalid signature', { status: 400 });
  }

  // 3. Parse and dispatch
  let payload: { events?: SmartsheetEvent[]; newWebhookStatus?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  if (payload.newWebhookStatus) {
    // Status change callback (webhook automatically disabled or re-enabled)
    console.log('Webhook status changed:', payload.newWebhookStatus);
  } else {
    for (const event of payload.events ?? []) {
      handleEvent(event);
    }
  }

  // Any 200 acknowledges the callback
  return NextResponse.json({ received: true });
}
