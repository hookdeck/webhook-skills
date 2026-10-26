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

/**
 * Alertmanager does not sign payloads. http_config.authorization (default type
 * Bearer) sends `Authorization: Bearer <credentials>` on every request.
 * The secret is stored bare; if the configured value starts with "Bearer ",
 * that prefix is stripped (as Hookdeck does). The secret is otherwise untouched.
 */
function verifyAlertmanagerRequest(headers, secret = process.env.ALERTMANAGER_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept when unconfigured
  const expected = secret.replace(BEARER, '');
  if (!expected) return false; // a configured value of just "Bearer " must not match
  const header = headers['authorization'];
  if (!header || !BEARER.test(header)) return false;
  return safeEqual(header.replace(BEARER, ''), expected);
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
    return res.status(401).json({ error: 'Invalid or missing Authorization bearer credentials' });
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
