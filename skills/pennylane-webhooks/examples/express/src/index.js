// Generated with: pennylane-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Pennylane signs every delivery with an X-Pennylane-Signature header:
//   t=<unix seconds>,v1=<hex>
// v1 is HMAC-SHA256 (hex) of "<t>.<raw body>", keyed with the subscription secret as-is.
// Pennylane's docs show one v1; accepting any matching v1 is a harmless defensive choice.
// https://pennylane.readme.io/docs/authorization

// Optional replay window in seconds. Off by default (0): Hookdeck retries and replays carry the
// original timestamp, so a window would reject late redeliveries.
// Set PENNYLANE_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.PENNYLANE_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`PENNYLANE_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// Split on ',', trim each part (a space after the comma is allowed), keep t and every v1
function parseSignatureHeader(header) {
  let t;
  const v1 = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't' && t === undefined) t = value;
    else if (key === 'v1') v1.push(value);
  }
  return { t, v1 };
}

function verifyPennylane(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!t || v1.length === 0) return false;

  // Pennylane suggests rejecting timestamps older than 5 minutes. It's opt-in here: off unless
  // PENNYLANE_TIMESTAMP_TOLERANCE_SECONDS > 0.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0) {
    if (!/^\d+$/.test(t)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > tolerance) return false;
  }

  const expected = Buffer.from(
    crypto
      .createHmac('sha256', secret) // subscription secret used as-is, not decoded
      .update(`${t}.`)
      .update(rawBody)
      .digest('hex')
  );
  // Require exactly 64 hex chars first, then compare the lowercase strings as equal-length
  // buffers: no Buffer.from(x, 'hex'), which silently truncates invalid hex.
  return v1.some(
    (v) => /^[0-9a-f]{64}$/i.test(v) && crypto.timingSafeEqual(Buffer.from(v.toLowerCase()), expected)
  );
}

// Raw body is required: the signature covers the exact bytes Pennylane sent.
// type: '*/*' reads the body whatever the Content-Type is, so verification never depends on it.
app.post('/webhooks/pennylane', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.PENNYLANE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('PENNYLANE_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  // 400, not 401/403/404/410: Pennylane disables the subscription at once on those four
  if (!verifyPennylane(rawBody, req.headers['x-pennylane-signature'], secret)) {
    console.error('Pennylane webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // payload.id is the delivery id: deduplicate on it (deliveries are at-least-once and unordered)
  const object = payload.data?.object;
  const companyId = payload.data?.context?.company_id;

  switch (payload.event) {
    case 'customer_invoice.e_invoicing_status_updated':
      console.log(
        `Customer invoice ${object?.id} (company ${companyId}) e-invoicing status: ` +
        `${payload.data?.previous_attributes?.e_invoicing?.status ?? 'none'} -> ${object?.e_invoicing?.status}`
      );
      break;
    case 'dms_file.created':
      console.log(`DMS file ${object?.id} created (company ${companyId})`);
      break;
    case 'supplier_invoice.e_invoicing_received':
      console.log(`Supplier invoice ${object?.id} received via e-invoicing (company ${companyId})`);
      break;
    default:
      console.log(`Unhandled event: ${payload.event}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Pennylane webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyPennylane };
