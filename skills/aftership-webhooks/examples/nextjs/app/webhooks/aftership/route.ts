// Generated with: aftership-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * AfterShip Tracking webhook envelope (webhook-specifications, version 2026-07).
 *
 * `event` is one of exactly three codes; the shipment STATUS lives in
 * `msg.tag` / `msg.subtag`.
 */
export interface TrackingWebhookPayload {
  /** `tracking_update` | `edd_revise` | `tracking_pending_time` */
  event: string;
  /** UUID v4, unique per event — use as the idempotency key. */
  event_id: string;
  is_tracking_first_tag?: boolean;
  /** The full Tracking object. */
  msg: {
    id?: string;
    tracking_number?: string;
    /** Carrier slug, e.g. "usps". */
    slug?: string;
    /** Pending | InfoReceived | InTransit | OutForDelivery | AttemptFail | Delivered | AvailableForPickup | Exception | Expired */
    tag?: string;
    subtag?: string;
    subtag_message?: string;
    title?: string;
    order_number?: string;
    checkpoints?: Array<Record<string, any>>;
    aftership_estimated_delivery_date?: Record<string, any>;
    [key: string]: any;
  };
  /** UTC UNIX seconds when the event occurred. UNSIGNED — never use for replay checks. */
  ts?: number;
}

/** AfterShip Shipping (formerly Postmen) envelope. */
export interface ShippingWebhookPayload {
  /** `calculate_rates` | `create_a_label` | `cancel_a_label` | `manifest_a_label` */
  event_type: string;
  date_time?: string;
  /** The standard AfterShip Shipping API envelope. */
  meta?: { code?: number; message?: string; details?: unknown[] };
  /** The same object the synchronous API would have returned. */
  data?: Record<string, any>;
}

/** AfterShip Returns and Warranty envelope (they share one shape and one header). */
export interface ReturnsWebhookPayload {
  /** UUID, unique per event — use as the idempotency key. */
  id: string;
  /** Payload version, e.g. "2026-07". Also sent as the as-webhook-version header. */
  version?: string;
  event: string;
  created_at?: string;
  /** Event-specific diff of what changed. */
  modified?: Record<string, any>;
  /** Full snapshot of the return object. */
  data?: Record<string, any>;
}

export interface WarrantyWebhookPayload {
  /** Unique per event — use as the idempotency key. */
  id: string;
  version?: string;
  event: string;
  created_at?: string;
  /** `warranty` holds the claim reference; shipment events also carry `warranty_shipment`. */
  data?: { warranty?: { id?: string }; warranty_shipment?: Record<string, any> };
  /** The full claim resource (status, rma_number, items, order, ...). */
  current_context?: { id?: string; status?: string; rma_number?: string } & Record<string, any>;
}

export type AfterShipWebhookPayload =
  | TrackingWebhookPayload
  | ShippingWebhookPayload
  | ReturnsWebhookPayload
  | WarrantyWebhookPayload;

/**
 * AfterShip signature headers, checked in this order.
 *
 * Every AfterShip product signs the same way —
 * base64(HMAC-SHA256(secret_as_utf8, raw_body)) — and only the header name differs.
 *
 *   aftership-hmac-sha256     Tracking            bare base64 digest
 *   as-signature-hmac-sha256  Returns, Warranty   bare base64 digest
 *   am-webhook-signature      Shipping (Postmen)  hmac-sha256=<base64 digest>
 *                             and Returns for orgs created before Oct 25, 2022
 *
 * Nothing but the body is signed: there is no timestamp header and no replay
 * window, so do NOT add a timestamp tolerance check.
 */
const SIGNATURE_HEADERS: Array<[string, string]> = [
  ['aftership-hmac-sha256', 'tracking'],
  ['as-signature-hmac-sha256', 'returns/warranty'],
  ['am-webhook-signature', 'shipping'],
];

export interface VerificationResult {
  valid: boolean;
  reason: 'missing_secret' | 'missing_signature_header' | 'signature_mismatch' | null;
  header?: string;
  product?: string;
}

/** Find whichever AfterShip signature header is present. */
export function extractSignature(
  headers: Headers
): { header: string; product: string; signature: string } | null {
  for (const [header, product] of SIGNATURE_HEADERS) {
    const value = headers.get(header);
    if (value) {
      // Shipping (and legacy Returns) prefix the digest. Stripping the prefix is
      // a no-op on the two headers that send it bare.
      return { header, product, signature: value.replace(/^hmac-sha256=/, '') };
    }
  }
  return null;
}

/**
 * Verify an AfterShip webhook signature.
 *
 * @param rawBody - The RAW request body from `await request.text()`. Never a
 *   re-stringified object: re-serializing changes the bytes and the signature
 *   will not match.
 * @param headers - The request headers.
 * @param secret - AFTERSHIP_WEBHOOK_SECRET, used as UTF-8 bytes (it is NOT
 *   base64-encoded and carries no prefix).
 */
export function verifyAfterShipSignature(
  rawBody: string,
  headers: Headers,
  secret: string | undefined
): VerificationResult {
  // Fail CLOSED on a missing secret. Treating "no secret" as "skip verification"
  // would accept every forged request the moment an env var goes missing.
  if (!secret) {
    return { valid: false, reason: 'missing_secret' };
  }

  const found = extractSignature(headers);
  if (!found) {
    return { valid: false, reason: 'missing_signature_header' };
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');

  const received = Buffer.from(found.signature);
  const computed = Buffer.from(expected);

  // crypto.timingSafeEqual THROWS when the buffers differ in length — which is
  // exactly what a forged short signature looks like. Guard the length first.
  const valid =
    received.length === computed.length && crypto.timingSafeEqual(received, computed);

  return {
    valid,
    reason: valid ? null : 'signature_mismatch',
    header: found.header,
    product: found.product,
  };
}

export async function POST(request: NextRequest) {
  // Read the RAW body. Do not use request.json() here — the signature is over
  // these exact bytes, and re-serializing a parsed object breaks it.
  const rawBody = await request.text();

  const result = verifyAfterShipSignature(
    rawBody,
    request.headers,
    process.env.AFTERSHIP_WEBHOOK_SECRET
  );

  if (!result.valid) {
    if (result.reason === 'missing_secret') {
      console.error('AFTERSHIP_WEBHOOK_SECRET is not set — refusing to process webhooks');
      return new NextResponse('Server misconfigured: AFTERSHIP_WEBHOOK_SECRET is not set', {
        status: 500,
      });
    }
    if (result.reason === 'missing_signature_header') {
      console.error('No AfterShip signature header present');
      return new NextResponse('Missing signature header', { status: 401 });
    }
    console.error(`AfterShip signature mismatch on ${result.header}`);
    return new NextResponse('Invalid signature', { status: 401 });
  }

  // Parse only AFTER the signature is verified.
  let payload: AfterShipWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    console.error('Failed to parse JSON:', error);
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  // Tracking and Returns/Warranty echo the payload version their webhook URL was
  // configured with. Fields change between versions (2026-01 renamed
  // checkpoint.zip to checkpoint.postal_code), so log it.
  const version = request.headers.get('as-webhook-version');
  console.log(
    `✓ Verified AfterShip webhook (${result.product}, ${result.header}${
      version ? `, version ${version}` : ''
    })`
  );

  // Keep this fast. A non-2xx triggers up to 14 retries with 2^retry x 30s backoff
  // (~68 hours). Deliveries are at-least-once — de-duplicate on event_id (Tracking)
  // or id (Returns/Warranty). For slow work, enqueue here and return immediately.
  try {
    handleWebhook(payload);
  } catch (error) {
    // Don't fail the delivery over a downstream error — that only starts the
    // retry cycle. Log and acknowledge.
    console.error('Error handling AfterShip webhook:', error);
  }

  return NextResponse.json({ received: true });
}

/**
 * Route to the right product handler.
 *
 * Shipping puts the event name in `event_type`; Tracking, Returns and Warranty
 * all use `event`. Returns and Warranty events are dotted and namespaced.
 */
function handleWebhook(payload: AfterShipWebhookPayload): void {
  if (typeof (payload as ShippingWebhookPayload).event_type === 'string') {
    return handleShippingEvent(payload as ShippingWebhookPayload);
  }

  const event = (payload as TrackingWebhookPayload | ReturnsWebhookPayload | WarrantyWebhookPayload).event;
  if (typeof event !== 'string') {
    console.log('❓ AfterShip payload with no recognisable event field');
    return;
  }

  if (event.startsWith('return.')) return handleReturnsEvent(payload as ReturnsWebhookPayload);
  if (event.startsWith('warranty.')) return handleWarrantyEvent(payload as WarrantyWebhookPayload);
  return handleTrackingEvent(payload as TrackingWebhookPayload);
}

/**
 * AfterShip Tracking.
 *
 * There are exactly THREE event codes. The shipment status is in msg.tag /
 * msg.subtag, not in `event` — so tracking_update dispatches on the tag.
 */
function handleTrackingEvent(payload: TrackingWebhookPayload): void {
  const { event, event_id: eventId, is_tracking_first_tag: isFirstTag, ts } = payload;
  const msg = payload.msg ?? {};

  // event_id is a UUID v4, unique per event — use it as the idempotency key.
  console.log(`📦 Tracking event ${event} (event_id=${eventId}, ts=${ts})`);

  switch (event) {
    case 'tracking_update':
      return handleTrackingStatus(msg, isFirstTag);

    case 'edd_revise':
      console.log(
        `📅 EDD revised for ${msg.tracking_number}: ${
          JSON.stringify(msg.aftership_estimated_delivery_date) ?? 'unknown'
        }`
      );
      // TODO: update the promised delivery date, notify the customer of a delay
      return;

    case 'tracking_pending_time':
      console.log(
        `⏳ Shipment ${msg.tracking_number} (${msg.slug}) has been pending past the configured threshold`
      );
      // TODO: chase the warehouse, flag the carrier
      return;

    default:
      // Forward-compatibility: acknowledge unknown events rather than failing.
      console.log(`❓ Unhandled Tracking event "${event}"`);
  }
}

/** Dispatch a tracking_update on msg.tag — the actual delivery status. */
function handleTrackingStatus(
  msg: TrackingWebhookPayload['msg'],
  isFirstTag: boolean | undefined
): void {
  const where = `${msg.tracking_number} (${msg.slug}, order ${msg.order_number ?? 'n/a'})`;
  const detail = msg.subtag_message ?? msg.subtag ?? '';
  const checkpoints = msg.checkpoints ?? [];
  const latest = checkpoints[checkpoints.length - 1];

  switch (msg.tag) {
    case 'Pending':
      console.log(`🕗 Pending — no carrier scan yet for ${where}`);
      break;

    case 'InfoReceived':
      console.log(`🧾 Info received for ${where}${isFirstTag ? ' (first update under this tag)' : ''}`);
      break;

    case 'InTransit':
      console.log(`🚚 In transit: ${where} — ${detail}`);
      break;

    case 'OutForDelivery':
      console.log(`🛵 Out for delivery: ${where}`);
      // TODO: send the "arriving today" notification
      break;

    case 'AttemptFail':
      console.log(`⚠️  Delivery attempt failed for ${where} — ${detail}`);
      // TODO: prompt the customer to reschedule
      break;

    case 'Delivered':
      console.log(`✅ Delivered: ${where}`);
      // TODO: mark the order delivered, trigger the review request
      break;

    case 'AvailableForPickup':
      console.log(`🏪 Available for pickup: ${where} — ${detail}`);
      break;

    case 'Exception':
      console.log(`🚨 Exception on ${where} — ${detail}`);
      // TODO: open a support ticket
      break;

    case 'Expired':
      console.log(`🗑️  Expired (no tracking info for 30 days): ${where}`);
      break;

    default:
      // Treat tag values as open strings — new ones can appear.
      console.log(`❓ Unhandled tracking tag "${msg.tag}" for ${where}`);
  }

  if (latest) {
    console.log(`   latest checkpoint: ${latest.checkpoint_time} — ${latest.message}`);
  }
}

/**
 * AfterShip Shipping (formerly Postmen). Events report that an async API call
 * finished; `meta` is the standard API envelope, `data` the API response data.
 */
function handleShippingEvent(payload: ShippingWebhookPayload): void {
  const { event_type: eventType, date_time: dateTime } = payload;
  const meta = payload.meta ?? {};
  const data = payload.data ?? {};

  console.log(`🚢 Shipping event ${eventType} at ${dateTime} (meta.code=${meta.code})`);

  // A non-200 meta.code means the underlying operation FAILED — `data` is not a
  // success payload in that case.
  if (meta.code && meta.code !== 200) {
    console.error(`   operation failed: ${meta.message}`, meta.details ?? []);
    return;
  }

  switch (eventType) {
    case 'calculate_rates':
      console.log(`   rates ready: ${(data.rates ?? []).length} option(s)`);
      break;

    case 'create_a_label':
      console.log(`   label ${data.id} created — ${data.files?.label?.url ?? 'no file URL'}`);
      // TODO: store the label URL against the order
      break;

    case 'cancel_a_label':
      console.log(`   label cancellation ${data.id}: ${data.status}`);
      break;

    case 'manifest_a_label':
      console.log(`   manifest ${data.id}: ${data.status}`);
      break;

    default:
      console.log(`❓ Unhandled Shipping event "${eventType}"`);
  }
}

/**
 * AfterShip Returns. Envelope: id, version, event, created_at, modified, data.
 * `modified` is an event-specific diff; `data` is the full return snapshot.
 */
function handleReturnsEvent(payload: ReturnsWebhookPayload): void {
  const { id, version, event, created_at: createdAt, modified } = payload;
  const data = payload.data ?? {};

  // `id` is unique per event — use it as the idempotency key.
  console.log(
    `↩️  Returns event ${event} (id=${id}, version=${version}, created_at=${createdAt})`
  );
  const rma = data.rma_number ?? data.id;

  switch (event) {
    case 'return.submitted':
      console.log(`   return ${rma} submitted`);
      break;

    case 'return.approved':
      console.log(`   return ${rma} approved (approval_status=${data.approval_status})`);
      // TODO: issue the return label, notify the shopper
      break;

    case 'return.rejected':
      console.log(`   return ${rma} rejected`);
      break;

    case 'return.resolved':
      console.log(`   return ${rma} resolved`);
      // TODO: reconcile the refund / exchange / store credit
      break;

    case 'return.expired':
      console.log(`   return ${rma} expired`);
      break;

    case 'return.dropoff.created':
    case 'return.dropoff.updated':
    case 'return.dropoff.shipment.updated':
      console.log(`   dropoff update on ${rma} (${event})`);
      break;

    case 'return.restock.created':
      console.log(`   restock recorded for ${rma}`);
      break;

    case 'return.shipment.provided':
    case 'return.shipments.provided':
    case 'return.shipment.recorded':
    case 'return.shipment.updated':
      console.log(`   shipment update on ${rma} (${event})`);
      break;

    case 'return.exchange.order.created':
      console.log(`   exchange order created for ${rma}`);
      break;

    case 'return.receiving.created':
      console.log(`   items received for ${rma}`);
      break;

    default:
      // AfterShip's docs say to treat enum values as open strings.
      console.log(`❓ Unhandled Returns event "${event}"`);
  }

  if (modified) {
    console.log('   modified:', JSON.stringify(modified));
  }
}

/**
 * AfterShip Warranty — same header as Returns, but its own envelope:
 * id, event, version, created_at, data.warranty (the claim reference) and
 * current_context (the full claim resource). There is no `modified` field.
 */
function handleWarrantyEvent(payload: WarrantyWebhookPayload): void {
  const { id, event } = payload;
  const claimId = payload.data?.warranty?.id ?? payload.current_context?.id ?? 'unknown';
  console.log(`🛡️  Warranty event ${event} (id=${id})`);

  switch (event) {
    case 'warranty.created':
    case 'warranty.approved':
    case 'warranty.processing':
    case 'warranty.completed':
    case 'warranty.canceled':
    case 'warranty.rejected':
      console.log(`   claim ${claimId} → ${event.split('.')[1]}`);
      break;

    case 'warranty.inbound_shipment.provided':
    case 'warranty.inbound_shipment.updated':
    case 'warranty.outbound_shipment.provided':
    case 'warranty.outbound_shipment.updated':
      console.log(`   shipment update on claim ${claimId} (${event})`);
      break;

    case 'warranty.item_received':
      console.log(`   item received for claim ${claimId}`);
      break;

    default:
      console.log(`❓ Unhandled Warranty event "${event}"`);
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
