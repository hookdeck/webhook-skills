// Generated with: prometheus-alertmanager-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const BEARER = /^bearer /i; // auth schemes are case-insensitive (RFC 9110)
const BASIC = /^basic +([A-Za-z0-9+/]+={0,2})$/i;

/** Decode `Basic base64(username:password)`; null unless it is canonical base64 with a colon. */
function parseBasic(header) {
  const m = BASIC.exec(header);
  if (!m || m[1].length % 4 !== 0) return null;
  const buf = Buffer.from(m[1], 'base64');
  if (buf.toString('base64') !== m[1]) return null; // reject junk after valid base64
  const decoded = buf.toString('utf8');
  const i = decoded.indexOf(':'); // split on the FIRST colon: a password may contain ':'
  if (i === -1) return null;
  return { username: decoded.slice(0, i), password: decoded.slice(i + 1) };
}

/**
 * Alertmanager does not sign payloads. The receiver's http_config sets the Authorization
 * header on every request, in one of two forms (Hookdeck's source offers both):
 * - authorization (default type Bearer): `Authorization: Bearer <credentials>`. The secret is
 *   stored bare in ALERTMANAGER_WEBHOOK_SECRET; a leading "Bearer " in it is stripped.
 * - basic_auth: `Authorization: Basic base64(username:password)`, checked against
 *   ALERTMANAGER_WEBHOOK_USERNAME and ALERTMANAGER_WEBHOOK_PASSWORD.
 * A form that isn't configured is rejected, so with neither configured everything is rejected.
 */
function verifyAlertmanagerRequest(
  headers,
  secret = process.env.ALERTMANAGER_WEBHOOK_SECRET,
  basic = {
    username: process.env.ALERTMANAGER_WEBHOOK_USERNAME,
    password: process.env.ALERTMANAGER_WEBHOOK_PASSWORD,
  }
) {
  const header = headers['authorization'];
  if (typeof header !== 'string' || !header) return false;

  if (BEARER.test(header)) {
    if (!secret) return false; // Bearer not configured
    const expected = secret.replace(BEARER, '');
    if (!expected) return false; // a configured value of just "Bearer " must not match
    return safeEqual(header.replace(BEARER, ''), expected);
  }

  if (/^basic /i.test(header)) {
    if (!basic || !basic.username || !basic.password) return false; // basic_auth not configured
    const creds = parseBasic(header);
    if (!creds) return false;
    const userOk = safeEqual(creds.username, basic.username);
    const passOk = safeEqual(creds.password, basic.password); // evaluate both, no short-circuit
    return userOk && passOk;
  }

  return false;
}

// In-memory dedupe for the example; use a shared store (Redis, DB) in production.
const seen = new Set();

function alertKey(groupKey, alert) {
  return [groupKey, alert.fingerprint, alert.status, alert.startsAt, alert.endsAt].join('|');
}

function handleAlert(alert, group) {
  const name = (alert.labels && alert.labels.alertname) || 'unknown';

  if (alert.status === 'firing') {
    console.log(`Alert firing: ${name} (${alert.fingerprint}) on receiver ${group.receiver}`);
    // TODO: page on-call or open an incident (alert.labels, alert.annotations)
  } else if (alert.status === 'resolved') {
    console.log(`Alert resolved: ${name} (${alert.fingerprint})`);
    // TODO: close the matching incident
  } else {
    console.log(`Unhandled alert status: ${alert.status}`);
  }
}

// status is a state, not an event type: loop over alerts[] and use each alert's own status.
function handleGroup(payload) {
  if (payload.truncatedAlerts > 0) {
    console.warn(`${payload.truncatedAlerts} alerts were truncated by max_alerts`);
  }
  for (const alert of payload.alerts || []) {
    const key = alertKey(payload.groupKey, alert);
    if (seen.has(key)) continue; // repeat notification (group_interval / repeat_interval)
    seen.add(key);
    handleAlert(alert, payload);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/prometheus-alertmanager', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyAlertmanagerRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization credentials' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }
  if (payload.alerts !== undefined && !Array.isArray(payload.alerts)) {
    return res.status(400).json({ error: 'Expected alerts to be an array' });
  }

  try {
    handleGroup(payload);
  } catch (err) {
    console.error('Error handling Alertmanager notification:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyAlertmanagerRequest = verifyAlertmanagerRequest;
module.exports.resetSeen = () => seen.clear();

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/prometheus-alertmanager`);
  });
}
