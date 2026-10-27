// Generated with: greenshades-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Greenshades documents no HTTP method, so accept every method a sender might use.
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const SHA256_HEX = /^[0-9a-fA-F]{64}$/;

// Signed message, as bytes: <X-GS-TIMESTAMP value> 0x0A <raw body bytes>
// The separator is a real LF (0x0A), not the two characters backslash and n.
function buildSignedContent(timestamp, rawBody) {
  return Buffer.concat([
    Buffer.from(timestamp, 'latin1'), // header value exactly as received
    Buffer.from('\n', 'utf8'),
    rawBody // raw bytes, never decoded and re-encoded
  ]);
}

function verifyGreenshadesSignature(rawBody, timestamp, signature, secret) {
  if (!timestamp || !signature || !secret) return false;
  // Whole header value is one bare 64-char hex digest (case-insensitive)
  if (!SHA256_HEX.test(signature)) return false;

  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8')) // key used as-is, not decoded
    .update(buildSignedContent(timestamp, rawBody))
    .digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // format validated above
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Opt-in only. The X-GS-TIMESTAMP format is not documented, so it is parsed
// (epoch seconds, epoch milliseconds or an ISO date) only when a tolerance is set.
function timestampWithinTolerance(timestamp, toleranceSeconds, nowMs = Date.now()) {
  let ms;
  if (/^\d+(\.\d+)?$/.test(timestamp)) {
    const n = Number(timestamp);
    ms = n > 1e12 ? n : n * 1000;
  } else {
    ms = Date.parse(timestamp);
  }
  if (!Number.isFinite(ms)) return false;
  return Math.abs(nowMs - ms) <= toleranceSeconds * 1000;
}

// Illustrative handlers. Subscribed event names come from Greenshades' webhook
// subscription API; the delivery body is not documented.
const handlers = {
  'payRun.completed': (p) => console.log('Pay run completed', p),
  'payRun.costReportingTransactions.completed': (p) => console.log('Cost reporting transactions completed', p),
  'payRun.payRecord.voided': (p) => console.log('Pay record voided', p),
  'payRun.payRecords.completed': (p) => console.log('Pay records completed', p),
  'paySchedule.updated': (p) => console.log('Pay schedule updated', p),
  'employee.added': (p) => console.log('Employee added', p),
  'employee.updated': (p) => console.log('Employee updated', p),
  'employee.directDeposit.updated': (p) => console.log('Direct deposit updated', p),
  'employee.paySchedule.updated': (p) => console.log('Employee pay schedule updated', p),
  'employee.earningCode.added': (p) => console.log('Earning code added', p),
  'employee.earningCode.updated': (p) => console.log('Earning code updated', p),
  'employee.earningCode.deleted': (p) => console.log('Earning code deleted', p)
};

// ILLUSTRATIVE: Greenshades does not document the delivery body, so which field
// carries the event name is unknown. Check a real delivery and adjust.
function getEventName(payload) {
  if (!payload || typeof payload !== 'object') return undefined;
  return payload.eventName || payload.event || payload.type || payload.name;
}

// Raw body for every content type, so the exact bytes are verified
app.all('/webhooks/greenshades', express.raw({ type: '*/*' }), (req, res) => {
  if (!ALLOWED_METHODS.includes(req.method)) {
    return res.status(405).send('Method not allowed');
  }

  const secret = process.env.GREENSHADES_WEBHOOK_SECRET;
  if (!secret) {
    console.error('GREENSHADES_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  // A missing body (e.g. GET) is empty bytes
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const timestamp = req.get('x-gs-timestamp');
  const signature = req.get('x-gs-signature');

  // Verify first, for every method
  if (!verifyGreenshadesSignature(rawBody, timestamp, signature, secret)) {
    console.error('Greenshades signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  const tolerance = Number(process.env.GREENSHADES_WEBHOOK_TOLERANCE_SECONDS) || 0;
  if (tolerance > 0 && !timestampWithinTolerance(timestamp, tolerance)) {
    return res.status(401).send('Timestamp outside tolerance');
  }

  // Parse only after the signature check
  let payload = null;
  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }
  }

  const eventName = getEventName(payload);
  const handler = eventName && handlers[eventName];
  if (handler) {
    handler(payload);
  } else {
    console.log(`Unhandled Greenshades event: ${eventName || 'unknown'}`);
  }

  res.json({ received: true });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Greenshades webhook server running on port ${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/greenshades`);
  });
}

module.exports = { app, buildSignedContent, verifyGreenshadesSignature, timestampWithinTolerance };
