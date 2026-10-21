// Generated with: pipedream-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Pipedream recommends rejecting signatures older than 5 minutes.
const TOLERANCE_SECONDS = 300;

/**
 * Parse x-pd-signature: "t=<unix seconds>,v1=<hex>".
 * Collects every v1 value so a future multi-signature header still verifies.
 */
function parseSignatureHeader(header) {
  let timestamp;
  const signatures = [];

  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1' && value) signatures.push(value.toLowerCase());
  }

  return { timestamp, signatures };
}

/**
 * Verify a Pipedream Connect trigger webhook.
 *
 * Signed content: `${t}.${rawBody}` (the raw bytes, not re-serialised JSON)
 * Algorithm:      HMAC-SHA256 keyed with the signing key (UTF-8), hex digest
 */
function verifyPipedreamSignature(
  rawBody,
  header,
  signingKey,
  toleranceSeconds = TOLERANCE_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  if (!header) {
    return { valid: false, error: 'Missing x-pd-signature header' };
  }

  const { timestamp, signatures } = parseSignatureHeader(header);
  if (!timestamp || !/^[0-9]+$/.test(timestamp) || signatures.length === 0) {
    return { valid: false, error: 'Malformed x-pd-signature header' };
  }

  // t is part of the signed content, so a replayed request can't refresh it.
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) {
    return { valid: false, error: 'Timestamp outside tolerance' };
  }

  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  const matched = signatures.some(
    (sig) =>
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  );

  return matched ? { valid: true } : { valid: false, error: 'Invalid signature' };
}

/** Constant-time string comparison for the connection-webhook URL token. */
function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseJson(rawBody) {
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    return undefined;
  }
}

// Trigger webhooks: events emitted by deployed triggers. Signed with x-pd-signature.
// express.raw keeps the exact bytes Pipedream signed.
app.post('/webhooks/pipedream', express.raw({ type: '*/*' }), (req, res) => {
  const signingKey = process.env.PIPEDREAM_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    console.error('PIPEDREAM_WEBHOOK_SIGNING_KEY is not set');
    return res.status(500).json({ error: 'Signing key not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const verification = verifyPipedreamSignature(rawBody, req.get('x-pd-signature'), signingKey);
  if (!verification.valid) {
    console.error('Pipedream signature verification failed:', verification.error);
    return res.status(400).json({ error: verification.error });
  }

  const event = parseJson(rawBody);
  if (event === undefined) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  // The body is whatever the deployed trigger emitted, so its shape depends on
  // the trigger (e.g. gitlab-new-issue emits a GitLab issue). There is no
  // Pipedream-level event type field: route on the trigger the URL belongs to.
  // In production: store the event, return 2xx, then process asynchronously.
  console.log('Pipedream trigger event received:', JSON.stringify(event).slice(0, 200));

  return res.status(200).json({ received: true });
});

// Connection webhooks: sent to a Connect token's webhook_uri. NOT signed by Pipedream.
app.post('/webhooks/pipedream/connect', express.raw({ type: '*/*' }), (req, res) => {
  // Pipedream doesn't sign these, so the only protection is a secret you put in
  // the webhook_uri yourself. Treat the payload as a hint and confirm it with
  // the Retrieve Account API before trusting it.
  const expectedToken = process.env.PIPEDREAM_CONNECT_WEBHOOK_TOKEN;
  if (expectedToken && !safeEqual(req.query.token ?? '', expectedToken)) {
    return res.status(400).json({ error: 'Invalid token' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const event = parseJson(rawBody);
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  switch (event.event) {
    case 'CONNECTION_SUCCESS':
      // Credentials are not in the payload; fetch them with Retrieve Account.
      console.log(`Account ${event.account?.id} connected for ${event.account?.external_id}`);
      break;
    case 'CONNECTION_ERROR':
      console.log(`Connection failed for token ${event.connect_token}: ${event.error}`);
      break;
    default:
      console.log('Unhandled Pipedream connection event:', event.event);
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyPipedreamSignature = verifyPipedreamSignature;
module.exports.parseSignatureHeader = parseSignatureHeader;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Trigger webhooks:    POST http://localhost:${PORT}/webhooks/pipedream`);
    console.log(`Connection webhooks: POST http://localhost:${PORT}/webhooks/pipedream/connect`);
  });
}
