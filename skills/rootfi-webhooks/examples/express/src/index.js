// Generated with: rootfi-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// RootFi (Commenda) signs a delivery with an X-RootFi-Signature header, only when the webhook
// config has a signing_key:
//   t=<unix seconds>,v1=<hex>
// v1 is HMAC-SHA256 (hex) of "<t>.<raw body>", keyed with the signing_key as UTF-8 bytes.
// https://integrations.docs.commenda.io/documentation/concepts/webhooks

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set ROOTFI_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.ROOTFI_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`ROOTFI_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// Split on ',', trim each part (a space after the comma is allowed), split on the first '='.
// Keep every v1 (several can be present during key rotation) and ignore other keys such as v0.
function parseSignatureHeader(header) {
  let t;
  const v1 = [];
  for (const part of header.split(',')) {
    const trimmed = part.trim();
    const i = trimmed.indexOf('=');
    if (i <= 0) continue;
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim();
    if (key === 't') t = value;
    else if (key === 'v1') v1.push(value);
  }
  return { t, v1 };
}

function verifyRootfi(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!t || v1.length === 0) return false;

  // Opt-in only: off unless ROOTFI_WEBHOOK_TOLERANCE_SECONDS > 0. t is Unix seconds.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0) {
    if (!/^\d+$/.test(t)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > tolerance) return false;
  }

  // t stays the string from the header; the body stays raw bytes (never decoded and re-encoded).
  const expected = crypto
    .createHmac('sha256', secret) // signing_key as UTF-8, not hex- or base64-decoded
    .update(`${t}.`)
    .update(rawBody)
    .digest(); // 32 bytes

  // Check for exactly 64 hex chars before Buffer.from(x, 'hex'): invalid hex silently truncates.
  // Hex is case-insensitive, so Buffer.from decodes upper and lower case to the same bytes.
  return v1.some(
    (sig) => /^[0-9a-f]{64}$/i.test(sig) && crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected)
  );
}

// Raw body is required: the signature covers the exact bytes RootFi sent.
// type: '*/*' reads the body whatever the Content-Type is, so verification never depends on it.
app.post('/webhooks/rootfi', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.ROOTFI_WEBHOOK_SECRET;
  if (!secret) {
    console.error('ROOTFI_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyRootfi(rawBody, req.headers['x-rootfi-signature'], secret)) {
    console.error('RootFi webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (payload === null || typeof payload !== 'object') {
    return res.status(400).send('Invalid payload');
  }

  // Envelope: { event, data }. Delivery is at least once and unordered: dedupe on the
  // X-RootFi-Webhook-Delivery-Id header (stable across retries) and upsert records.
  const deliveryId = req.headers['x-rootfi-webhook-delivery-id'];
  const data = payload.data || {};
  switch (payload.event) {
    case 'DATA_MODEL_CHANGES':
      console.log(`[${deliveryId}] ${data.data_model} ${data.type}: ${data.no_of_records} records (sync ${data.sync_id}, company ${data.company_id})`);
      break;
    case 'SYNC_STARTED':
      console.log(`[${deliveryId}] Sync ${data.sync_id} started for company ${data.company_id} (${data.integration_type}), full sync: ${data.full_sync}`);
      break;
    case 'SYNC_COMPLETED':
      console.log(`[${deliveryId}] Sync ${data.sync_id} completed with status ${data.status} (${data.failed_jobs_count} failed jobs)`);
      break;
    case 'CONNECTION_CHANGED':
      console.log(`[${deliveryId}] Connection ${data.connection_id} is now ${data.status}`);
      break;
    case 'DISCONNECT_REQUESTED':
      // Requests a disconnect only; nothing is disconnected until a dashboard user resolves it.
      console.log(`[${deliveryId}] Disconnect request ${data.disconnect_request_id} for connection ${data.connection_id}`);
      break;
    default:
      console.log(`Unhandled event: ${payload.event}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`RootFi webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyRootfi };
