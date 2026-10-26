// Generated with: basin-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Basin webhook signature.
 *
 * Basin sends `X-Basin-Signature: sha256=<hex>` where <hex> is the HMAC-SHA256 of the
 * raw request body, keyed with the webhook signing secret (Growth plan and above).
 */
function verifyBasinSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const received = signatureHeader.slice('sha256='.length);
  // Check hex shape first: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
}

/** Parse the submission: JSON, data-wrapped JSON, or form-urlencoded. */
function parseSubmission(rawBody, contentType) {
  const text = rawBody.toString('utf8');
  let payload;
  if (/json/i.test(contentType || '') || text.trimStart().startsWith('{')) {
    payload = JSON.parse(text);
  } else {
    payload = Object.fromEntries(new URLSearchParams(text));
  }
  // A JSON body like `null` or `42` is not a submission: throw so the handler answers 400
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('submission must be an object');
  }
  // "Data wrapped JSON" nests the fields under `data`; the form-encoded type may also wrap a string
  if (payload && typeof payload.data === 'object' && payload.data !== null) return payload.data;
  if (payload && typeof payload.data === 'string') {
    return Object.fromEntries(new URLSearchParams(payload.data));
  }
  return payload;
}

// Basin has no event types: every webhook is a form submission.
// Read the raw body for ANY content type so the signature can be verified before parsing.
app.post('/webhooks/basin', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.BASIN_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BASIN_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = req.headers['x-basin-signature'];

  if (!verifyBasinSignature(rawBody, signature, secret)) {
    console.error('Basin webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let submission;
  try {
    submission = parseSubmission(rawBody, req.headers['content-type']);
  } catch {
    return res.status(400).send('Invalid body');
  }

  // Use the submission id for idempotency (Basin retries failed deliveries up to 15 times)
  console.log(`Basin form submission ${submission.id ?? '(no id)'} from ${submission.email ?? 'unknown'}`);

  res.json({ received: true });
});

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => console.log(`Basin webhook server listening on port ${port}`));
}

module.exports = { app, verifyBasinSignature, parseSubmission };
