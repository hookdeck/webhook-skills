// Generated with: adyen-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { hmacValidator } from '@adyen/api-library';

// Adyen's official HMAC validator builds the ':'-delimited signing string from
// the NotificationRequestItem fields, hex-decodes the key, computes
// HMAC-SHA256/base64, and timing-safe compares against additionalData.hmacSignature.
const validator = new hmacValidator();

interface NotificationRequestItem {
  eventCode: string;
  success: string;
  pspReference: string;
  originalReference?: string;
  merchantAccountCode?: string;
  merchantReference?: string;
  amount?: { value: number; currency: string };
  reason?: string;
  additionalData?: { hmacSignature?: string };
}

/**
 * Optional Basic Auth check. Only enforced when both env vars are configured.
 */
function checkBasicAuth(authHeader: string | null): boolean {
  const user = process.env.ADYEN_WEBHOOK_USERNAME;
  const pass = process.env.ADYEN_WEBHOOK_PASSWORD;
  if (!user || !pass) return true; // Basic Auth not configured

  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  return decoded.slice(0, sep) === user && decoded.slice(sep + 1) === pass;
}

/** Verify a single item; returns false instead of throwing on malformed input. */
function isValid(item: NotificationRequestItem): boolean {
  try {
    // The SDK type is stricter than the parsed JSON, so cast at the boundary.
    return validator.validateHMAC(item as never, process.env.ADYEN_HMAC_KEY as string);
  } catch {
    return false;
  }
}

function handleNotification(item: NotificationRequestItem): void {
  const ok = item.success === 'true';
  switch (item.eventCode) {
    case 'AUTHORISATION':
      // success === 'false' means the payment was REFUSED.
      console.log(`AUTHORISATION ${ok ? 'succeeded' : 'refused'} for ${item.merchantReference} (${item.pspReference})`);
      // TODO: fulfil the order on success, notify the shopper on refusal.
      break;
    case 'CAPTURE':
      console.log(`CAPTURE ${ok ? 'succeeded' : 'failed'} for ${item.pspReference}`);
      break;
    case 'CAPTURE_FAILED':
      console.log(`CAPTURE_FAILED for ${item.pspReference}`);
      break;
    case 'REFUND':
      console.log(`REFUND ${ok ? 'succeeded' : 'failed'} for ${item.pspReference}`);
      break;
    case 'REFUND_FAILED':
      console.log(`REFUND_FAILED for ${item.pspReference}`);
      break;
    case 'CANCELLATION':
      console.log(`CANCELLATION ${ok ? 'succeeded' : 'failed'} for ${item.pspReference}`);
      break;
    case 'CANCEL_OR_REFUND':
      console.log(`CANCEL_OR_REFUND ${ok ? 'succeeded' : 'failed'} for ${item.pspReference}`);
      break;
    case 'CHARGEBACK':
      console.log(`CHARGEBACK for ${item.pspReference}`);
      break;
    case 'NOTIFICATION_OF_CHARGEBACK':
      console.log(`NOTIFICATION_OF_CHARGEBACK for ${item.pspReference}`);
      break;
    case 'REPORT_AVAILABLE':
      console.log(`REPORT_AVAILABLE: ${item.reason || ''}`);
      break;
    default:
      console.log(`Unhandled eventCode: ${item.eventCode} (${item.pspReference})`);
  }
}

export async function POST(request: NextRequest) {
  // 1. Optional Basic Auth
  if (!checkBasicAuth(request.headers.get('authorization'))) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Adyen posts JSON. HMAC is over reconstructed fields (not the raw body),
  // so parsing the JSON before verifying is correct for Adyen.
  let body: { notificationItems?: Array<{ NotificationRequestItem: NotificationRequestItem }> };
  try {
    body = await request.json();
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  const items = body.notificationItems;
  if (!Array.isArray(items)) {
    return new NextResponse('Invalid notification', { status: 400 });
  }

  // 2. Verify every item before processing any of them.
  for (const entry of items) {
    const item = entry?.NotificationRequestItem;
    if (!item || !isValid(item)) {
      console.error('HMAC signature verification failed');
      return new NextResponse('Invalid HMAC signature', { status: 401 });
    }
  }

  // 3. All items verified — process them.
  for (const entry of items) {
    handleNotification(entry.NotificationRequestItem);
  }

  // 4. Acknowledge with the literal body Adyen expects.
  return new NextResponse('[accepted]', { status: 200 });
}
