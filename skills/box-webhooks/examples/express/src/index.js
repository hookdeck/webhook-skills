// Generated with: box-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Box V2 webhooks send BOX-SIGNATURE-PRIMARY (and BOX-SIGNATURE-SECONDARY): standard padded base64
// HMAC-SHA256 of the raw request body followed by the BOX-DELIVERY-TIMESTAMP header value, with
// no separator, keyed with the signature key. Only the primary signature is verified here.
// https://developer.box.com/guides/webhooks/v2/signatures-v2/

// 44 characters: 43 base64 characters plus one "=" pad (a 32-byte digest)
const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=$/;

// Optional replay window in seconds. Off by default (0 or unset): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set BOX_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in (Box suggests 600);
// any other value is treated as 0, with a warning.
let warnedInvalidTolerance = false;
function toleranceSeconds() {
  const raw = (process.env.BOX_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`BOX_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
toleranceSeconds(); // surface an invalid value at startup

function verifyBox(rawBody, signature, timestamp, secret) {
  if (!secret || !signature || !timestamp) return false;
  if (!BASE64_SHA256.test(signature)) return false;

  // BOX-DELIVERY-TIMESTAMP is an RFC 3339 date. Opt-in only.
  const tolerance = toleranceSeconds();
  if (tolerance > 0) {
    const sent = Date.parse(timestamp);
    if (Number.isNaN(sent) || Math.abs(Date.now() - sent) > tolerance * 1000) return false;
  }

  // Signed message as bytes: raw body, then the timestamp header exactly as received (latin1)
  const signed = Buffer.concat([rawBody, Buffer.from(timestamp, 'latin1')]);
  const expected = crypto.createHmac('sha256', secret).update(signed).digest('base64');

  const a = Buffer.from(signature, 'latin1');
  const b = Buffer.from(expected, 'latin1');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Box's docs don't name the HTTP method (Hookdeck pre-selects POST, unmanaged), so every method is
// verified the same way. Raw body is required: the signature covers the exact bytes Box sent.
// type: '*/*' so any content type reaches the verifier as a Buffer.
app.all('/webhooks/box', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.BOX_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BOX_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  // A request without a body leaves req.body unset: treat it as empty bytes
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyBox(rawBody, req.headers['box-signature-primary'], req.headers['box-delivery-timestamp'], secret)) {
    console.error('Box webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Hookdeck leaves the method unmanaged, so a verified request may arrive without a body
  if (rawBody.length === 0) return res.status(200).json({ received: true });

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // event.id is stable across Box retries (BOX-DELIVERY-ID changes per retry): use it to dedupe
  const { trigger, id, source = {} } = event;

  switch (trigger) {
    case 'FILE.UPLOADED':
    case 'FILE.DOWNLOADED':
    case 'FILE.TRASHED':
      console.log(`${trigger}: file ${source.id} "${source.name}" (event ${id})`);
      break;
    case 'FOLDER.CREATED':
      console.log(`${trigger}: folder ${source.id} "${source.name}" (event ${id})`);
      break;
    case 'COMMENT.CREATED':
      console.log(`${trigger}: comment ${source.id} (event ${id})`);
      break;
    case 'COLLABORATION.CREATED':
      console.log(`${trigger}: collaboration ${source.id} (event ${id})`);
      break;
    case 'SIGN_REQUEST.COMPLETED':
      console.log(`${trigger}: sign request ${source.id} completed (event ${id})`);
      break;
    default:
      console.log(`Unhandled trigger: ${trigger}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Box webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyBox };
