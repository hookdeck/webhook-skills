// Generated with: aftership-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * AfterShip signature headers, checked in this order.
 *
 * All four AfterShip products that send webhooks use the SAME algorithm —
 * base64(HMAC-SHA256(secret_as_utf8, raw_body)) — and differ only in the header
 * name they put it in.
 *
 *   aftership-hmac-sha256     Tracking            bare base64 digest
 *   as-signature-hmac-sha256  Returns, Warranty   bare base64 digest
 *   am-webhook-signature      Shipping (Postmen)  hmac-sha256=<base64 digest>
 *                             and Returns for orgs created before Oct 25, 2022
 *
 * Nothing but the body is signed: there is no timestamp header and no replay
 * window, so do NOT add a timestamp tolerance check.
 */
const SIGNATURE_HEADERS = [
  ['aftership-hmac-sha256', 'tracking'],
  ['as-signature-hmac-sha256', 'returns/warranty'],
  ['am-webhook-signature', 'shipping'],
];

/**
 * Find whichever AfterShip signature header is present.
 *
 * @param {Record<string, any>} headers - Lowercased request headers
 * @returns {{ header: string, product: string, signature: string } | null}
 */
function extractSignature(headers) {
  for (const [header, product] of SIGNATURE_HEADERS) {
    const value = headers[header];
    if (typeof value === 'string' && value.length > 0) {
      // Shipping (and legacy Returns) prefix the digest. Stripping the prefix
      // is a no-op on the two headers that send it bare.
      return { header, product, signature: value.replace(/^hmac-sha256=/, '') };
    }
  }
  return null;
}

/**
 * Verify an AfterShip webhook signature.
 *
 * @param {Buffer|string} rawBody - RAW request body. Never a re-stringified object:
 *   re-serializing changes the bytes and the signature will not match.
 * @param {Record<string, any>} headers - Request headers
 * @param {string|undefined} secret - AFTERSHIP_WEBHOOK_SECRET, used as UTF-8 bytes
 *   (it is NOT base64-encoded and carries no prefix)
 * @returns {{ valid: boolean, reason: string|null, header?: string, product?: string }}
 */
function verifyAfterShipSignature(rawBody, headers, secret) {
  // Fail CLOSED on a missing secret. Treating "no secret" as "skip verification"
  // would accept every forged request the moment an env var goes missing.
  if (!secret) {
    return { valid: false, reason: 'missing_secret' };
  }

  const found = extractSignature(headers || {});
  if (!found) {
    return { valid: false, reason: 'missing_signature_header' };
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');

  const received = Buffer.from(found.signature);
  const computed = Buffer.from(expected);

  // crypto.timingSafeEqual THROWS when the buffers differ in length — which is
  // exactly what a forged short signature looks like. Guard the length first so
  // a bad signature is a 401, not a crash.
  const valid =
    received.length === computed.length && crypto.timingSafeEqual(received, computed);

  return {
    valid,
    reason: valid ? null : 'signature_mismatch',
    header: found.header,
    product: found.product,
  };
}

// AfterShip webhook endpoint.
//
// express.raw() is mounted on THIS route only so the handler receives the exact
// bytes AfterShip signed. Do not add a global express.json() ahead of it.
app.post(
  '/webhooks/aftership',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const result = verifyAfterShipSignature(
      req.body,
      req.headers,
      process.env.AFTERSHIP_WEBHOOK_SECRET
    );

    if (!result.valid) {
      if (result.reason === 'missing_secret') {
        console.error('AFTERSHIP_WEBHOOK_SECRET is not set — refusing to process webhooks');
        return res
          .status(500)
          .send('Server misconfigured: AFTERSHIP_WEBHOOK_SECRET is not set');
      }
      if (result.reason === 'missing_signature_header') {
        console.error('No AfterShip signature header present');
        return res.status(401).send('Missing signature header');
      }
      console.error(`AfterShip signature mismatch on ${result.header}`);
      return res.status(401).send('Invalid signature');
    }

    // Parse only AFTER the signature is verified.
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch (error) {
      console.error('Failed to parse JSON:', error);
      return res.status(400).send('Invalid JSON');
    }

    // Tracking and Returns/Warranty echo the payload version they were configured
    // with. Fields change between versions (2026-01 renamed checkpoint.zip to
    // checkpoint.postal_code), so log it.
    const version = req.headers['as-webhook-version'];
    console.log(
      `✓ Verified AfterShip webhook (${result.product}, ${result.header}${
        version ? `, version ${version}` : ''
      })`
    );

    // Acknowledge quickly, then process. A non-2xx triggers up to 14 retries with
    // 2^retry x 30s backoff (~68 hours). Deliveries are at-least-once — de-duplicate
    // on event_id (Tracking) or id (Returns/Warranty).
    res.status(200).json({ received: true });

    setImmediate(() => {
      try {
        handleWebhook(payload);
      } catch (error) {
        // The 200 is already sent; never let a handler error escape.
        console.error('Error handling AfterShip webhook:', error);
      }
    });
  }
);

/**
 * Route to the right product handler.
 *
 * Shipping puts the event name in `event_type`; Tracking, Returns and Warranty
 * all use `event`. Returns and Warranty events are dotted and namespaced.
 */
function handleWebhook(payload) {
  if (typeof payload.event_type === 'string') {
    return handleShippingEvent(payload);
  }

  const event = payload.event;
  if (typeof event !== 'string') {
    console.log('❓ AfterShip payload with no recognisable event field');
    return;
  }

  if (event.startsWith('return.')) return handleReturnsEvent(payload);
  if (event.startsWith('warranty.')) return handleWarrantyEvent(payload);
  return handleTrackingEvent(payload);
}

/**
 * AfterShip Tracking.
 *
 * There are exactly THREE event codes. The shipment status is in msg.tag /
 * msg.subtag, not in `event` — so tracking_update dispatches on the tag.
 */
function handleTrackingEvent(payload) {
  const { event, event_id: eventId, is_tracking_first_tag: isFirstTag, msg = {}, ts } = payload;

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

/**
 * Dispatch a tracking_update on msg.tag — the actual delivery status.
 */
function handleTrackingStatus(msg, isFirstTag) {
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
function handleShippingEvent(payload) {
  const { event_type: eventType, date_time: dateTime, meta = {}, data = {} } = payload;

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
function handleReturnsEvent(payload) {
  const { id, version, event, created_at: createdAt, modified, data = {} } = payload;

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
function handleWarrantyEvent(payload) {
  const { id, event, data = {}, current_context: claim = {} } = payload;
  const claimId = data.warranty?.id ?? claim.id ?? 'unknown';
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
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyAfterShipSignature, extractSignature };

// Start the server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/aftership`);
    if (!process.env.AFTERSHIP_WEBHOOK_SECRET) {
      console.warn('⚠️  AFTERSHIP_WEBHOOK_SECRET is not set — webhooks will be rejected with 500');
    }
  });
}
