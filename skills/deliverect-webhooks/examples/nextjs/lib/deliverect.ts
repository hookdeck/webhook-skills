import crypto from 'crypto';
import { NextResponse } from 'next/server';

const HEX_DIGEST = /^[0-9a-fA-F]{64}$/;

export const SIGNATURE_HEADER = 'x-server-authorization-hmac-sha256';

/**
 * Deliverect sends a bare hex HMAC-SHA256 of the raw body in x-server-authorization-hmac-sha256.
 * Nothing else is signed (no timestamp), and a GET with no body is signed over the empty string.
 * The secret is used as UTF-8 bytes: the call's channelLink / locationId before certification,
 * the Integration-settings HMAC secret after.
 */
export function verifyDeliverectSignature(
  rawBody: Uint8Array,
  signature: string | null,
  secret: string | undefined = process.env.DELIVERECT_WEBHOOK_SECRET
): boolean {
  if (!secret || typeof signature !== 'string') return false;
  if (!HEX_DIGEST.test(signature)) return false; // validate before decoding
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Deliverect has no event field: the kind of call is chosen by the URL you registered.
// Kind names and body fields below are illustrative; check your integration's payloads.
function handleDeliverectCall(kind: string, payload: JsonObject): void {
  switch (kind) {
    case 'order_status_update': {
      const orderId = typeof payload.orderId === 'string' ? payload.orderId : 'unknown';
      const status =
        typeof payload.status === 'string' || typeof payload.status === 'number'
          ? payload.status
          : 'unknown';
      console.log(`Order ${orderId} status: ${status}`);
      // TODO: update the order in your system
      break;
    }

    case 'menu_update': {
      const menus = Array.isArray(payload.menus) ? payload.menus : [];
      console.log(`Menu update with ${menus.length} menu(s)`);
      // TODO: sync the menu
      break;
    }

    case 'snooze_unsnooze': {
      const operations = Array.isArray(payload.operations) ? payload.operations : [];
      for (const op of operations) {
        if (!isObject(op)) continue;
        const action = typeof op.action === 'string' ? op.action : 'unknown';
        const items = isObject(op.data) && Array.isArray(op.data.items) ? op.data.items : [];
        console.log(`Snooze operation "${action}" for ${items.length} item(s)`);
        // TODO: update item availability
      }
      break;
    }

    case 'busy_mode': {
      const status = typeof payload.status === 'string' ? payload.status : 'unknown';
      console.log(`Busy mode: ${status}`);
      // TODO: pause or resume accepting orders
      break;
    }

    default:
      console.log(`Unhandled Deliverect call: ${kind || '(no kind)'}`);
  }
}

/**
 * Shared handler for every method and for both route files. The body is read as raw bytes
 * (any content type; empty for a GET) and verified before it is parsed.
 */
export async function handleDeliverectRequest(request: Request, kindSegment?: string) {
  const rawBody = new Uint8Array(await request.arrayBuffer());

  if (!verifyDeliverectSignature(rawBody, request.headers.get(SIGNATURE_HEADER))) {
    return NextResponse.json({ error: 'Invalid or missing Deliverect signature' }, { status: 401 });
  }

  const text = new TextDecoder().decode(rawBody);

  // A verified call with no body (such as a GET) is simply acknowledged.
  if (text.trim() === '') {
    console.log(`Deliverect ${request.method} request with an empty body`);
    return NextResponse.json({ received: true });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isObject(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  const kind = (kindSegment ?? '').toLowerCase().replace(/-/g, '_');
  try {
    handleDeliverectCall(kind, payload);
  } catch (err) {
    console.error('Error handling Deliverect webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
