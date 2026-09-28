// Generated with: grafana-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// Grafana Alerting webhook contact point receiver.
//
// Grafana signs with HMAC-SHA256 and writes a BARE lowercase hex digest into a
// user-configurable header (default: X-Grafana-Alerting-Signature). There is no
// `sha256=` prefix and no `t=...,v1=...` structure.
//
// What is signed depends on whether the contact point has a Timestamp Header:
//   timestamp header UNSET : HMAC(rawBody)
//   timestamp header SET   : HMAC(timestamp + ":" + rawBody)   <- COLON, seconds
//
// The secret is used AS-IS as UTF-8 bytes: not base64-decoded, no prefix, and not
// a Grafana API key or service-account token.
//
// Grafana sends NO event-type header and NO delivery id. Each request is one
// notification for an alert GROUP; dispatch on `status` / `state` / alerts[].status.

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

// Both header names are configured on the contact point, so read them from config.
// The signature header has a documented default; the timestamp header has NONE —
// leaving it empty means Grafana signs the body alone.
const SIGNATURE_HEADER = (
  process.env.GRAFANA_SIGNATURE_HEADER || 'X-Grafana-Alerting-Signature'
).toLowerCase();
const TIMESTAMP_HEADER = (process.env.GRAFANA_TIMESTAMP_HEADER || '').toLowerCase();

// Our replay window, not Grafana's — Grafana documents no tolerance. Only
// meaningful when a timestamp header is configured.
const MAX_AGE_SECONDS = Number(process.env.GRAFANA_MAX_AGE_SECONDS || 300);

/**
 * Verify a Grafana Alerting webhook signature.
 *
 * @param {Buffer|string} rawBody - RAW, unparsed request body.
 * @param {string|null} signature - Value of the configured signature header.
 * @param {string|null} timestamp - Value of the configured timestamp header, or null.
 * @param {string|undefined} secret - Contact point HMAC secret, used as-is.
 * @param {{timestampRequired?: boolean, maxAgeSeconds?: number}} [options]
 * @returns {boolean}
 */
function verifyGrafanaSignature(rawBody, signature, timestamp, secret, options = {}) {
  const { timestampRequired = Boolean(TIMESTAMP_HEADER), maxAgeSeconds = MAX_AGE_SECONDS } =
    options;

  // Fail closed: HMAC is optional in Grafana, but it is mandatory here.
  if (!secret || !signature) return false;

  if (timestampRequired) {
    // We're configured for timestamped signing, so a request without the header
    // cannot have been signed the way we expect. Rejecting it stops an attacker
    // from downgrading us to the weaker body-only mode.
    if (!timestamp) return false;

    const ts = Number(timestamp); // UNIX SECONDS (10 digits), never milliseconds
    if (!Number.isFinite(ts)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - ts) > maxAgeSeconds) return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  if (timestampRequired) {
    hmac.update(`${timestamp}:`); // COLON separator — HMAC(timestamp + ":" + body)
  }
  // Hash the RAW bytes. With the Custom Payload option the body may be
  // pretty-printed or not JSON at all, so re-serializing parsed JSON is wrong.
  hmac.update(rawBody);
  const expected = hmac.digest('hex'); // lowercase hex, bare

  // timingSafeEqual THROWS on differing lengths — guard first.
  const received = Buffer.from(String(signature).trim().toLowerCase(), 'utf8');
  const want = Buffer.from(expected, 'utf8');
  if (received.length !== want.length) return false;
  return crypto.timingSafeEqual(received, want);
}

/**
 * Build a heuristic idempotency key. Grafana sends no delivery id, so this is
 * derived from the group identity plus the alert instances it carries. Repeat
 * notifications for an unchanged group hash identically.
 */
function idempotencyKey(payload) {
  const alerts = (payload.alerts || [])
    .map((a) => `${a.fingerprint || ''}@${a.startsAt || ''}`)
    .sort()
    .join(',');
  return `${payload.groupKey || ''}:${payload.status || ''}:${alerts}`;
}

// Grafana webhook endpoint. express.raw() keeps req.body a Buffer so the exact
// bytes Grafana signed are the bytes we hash.
app.post('/webhooks/grafana', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.GRAFANA_WEBHOOK_SECRET;
  if (!secret) {
    // Fail CLOSED. Never silently accept unsigned requests.
    console.error('GRAFANA_WEBHOOK_SECRET is not set — refusing to accept webhooks');
    return res.status(500).send('Webhook secret not configured');
  }

  const signature = req.headers[SIGNATURE_HEADER];
  if (!signature) {
    return res.status(400).send(`Missing ${SIGNATURE_HEADER} header`);
  }

  const timestamp = TIMESTAMP_HEADER ? req.headers[TIMESTAMP_HEADER] : null;

  if (!verifyGrafanaSignature(req.body, signature, timestamp, secret)) {
    console.error('Grafana webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Parse only AFTER verification.
  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    // A Custom Payload template can render non-JSON. If you use one, handle the
    // body in whatever format your template emits instead.
    return res.status(400).send('Invalid JSON body');
  }

  console.log(
    `Notification from contact point "${payload.receiver}" ` +
      `(status=${payload.status}, state=${payload.state}, key=${idempotencyKey(payload)})`
  );

  if (payload.truncatedAlerts) {
    console.warn(`${payload.truncatedAlerts} alert(s) truncated by Max Alerts`);
  }

  // There are NO event types. Dispatch on the group status...
  switch (payload.status) {
    case 'firing':
      console.log(`FIRING: ${payload.title}`);
      // TODO: open an incident, page on-call, create a ticket
      break;

    case 'resolved':
      console.log(`RESOLVED: ${payload.title}`);
      // TODO: close the incident, post an all-clear
      break;

    default:
      console.log(`Unknown group status: ${payload.status}`);
  }

  // ...and on each alert, because a `firing` GROUP can contain `resolved` alerts
  // (the group is firing if ANY member is firing).
  for (const alert of payload.alerts || []) {
    const name = alert.labels?.alertname || '(unnamed)';
    if (alert.status === 'firing') {
      console.log(`  firing:   ${name} — ${alert.annotations?.summary || ''}`);
    } else if (alert.status === 'resolved') {
      console.log(`  resolved: ${name} (ended ${alert.endsAt})`);
    }
  }

  // Grafana treats any 2xx as success.
  res.status(200).send('OK');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyGrafanaSignature, idempotencyKey };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/grafana`);
    console.log(`Signature header: ${SIGNATURE_HEADER}`);
    console.log(
      TIMESTAMP_HEADER
        ? `Timestamp header: ${TIMESTAMP_HEADER} (signing timestamp + ":" + body)`
        : 'Timestamp header: not configured (signing body only)'
    );
  });
}
