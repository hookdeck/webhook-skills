// Generated with: harbor-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Check lengths first (timingSafeEqual throws on a
 * length mismatch), then compare equal-length Buffers.
 */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Harbor does not sign payloads. If you set an Auth Header on the webhook, Harbor sends it
 * verbatim as the Authorization header. Compare the WHOLE header value to
 * HARBOR_AUTHORIZATION (e.g. "Bearer <token>"); don't strip, parse or decode the prefix.
 */
function verifyHarborRequest(headers, config = process.env) {
  const expected = config.HARBOR_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

// CloudEvents format: reverse-DNS types map to the Default format's type names.
const CLOUDEVENTS_TYPES = {
  'harbor.artifact.pushed': 'PUSH_ARTIFACT',
  'harbor.artifact.pulled': 'PULL_ARTIFACT',
  'harbor.artifact.deleted': 'DELETE_ARTIFACT',
  'harbor.scan.completed': 'SCANNING_COMPLETED',
  'harbor.scan.stopped': 'SCANNING_STOPPED',
  'harbor.scan.failed': 'SCANNING_FAILED',
  'harbor.quota.exceeded': 'QUOTA_EXCEED',
  'harbor.quota.warned': 'QUOTA_WARNING',
  'harbor.replication.status.changed': 'REPLICATION',
  'harbor.tag_retention.finished': 'TAG_RETENTION',
};

/**
 * Both payload formats carry a `type`. Default: {type, occur_at, operator, event_data}.
 * CloudEvents: {specversion, id, type, time, data, operator}. Returns the event name
 * and its data in one shape.
 */
function normalize(payload) {
  const type = typeof payload.type === 'string' ? payload.type : null;
  if (!type) return { type: null, data: null };
  if (payload.specversion) {
    return { type: CLOUDEVENTS_TYPES[type] || type, data: payload.data, format: 'cloudevents' };
  }
  return { type, data: payload.event_data, format: 'default' };
}

function handleEvent(payload) {
  const { type, data } = normalize(payload);
  const repo = data && data.repository && data.repository.repo_full_name;

  switch (type) {
    case 'PUSH_ARTIFACT':
      console.log(`Artifact pushed to ${repo}`);
      // TODO: trigger a build or deployment for the pushed artifact
      break;

    case 'PULL_ARTIFACT':
      console.log(`Artifact pulled from ${repo}`);
      break;

    case 'DELETE_ARTIFACT':
      console.log(`Artifact deleted from ${repo}`);
      break;

    case 'SCANNING_COMPLETED':
      console.log(`Scan completed for ${repo}`);
      // TODO: inspect scan_overview severity and gate promotion
      break;

    case 'SCANNING_STOPPED':
      console.log(`Scan stopped for ${repo}`);
      break;

    case 'SCANNING_FAILED':
      console.log(`Scan failed for ${repo}`);
      break;

    case 'QUOTA_EXCEED':
      console.log(`Project quota exceeded at ${repo}`);
      // TODO: alert the project owners
      break;

    case 'QUOTA_WARNING':
      console.log(`Project quota near threshold at ${repo}`);
      break;

    case 'REPLICATION':
      console.log(`Replication status: ${data && data.replication && data.replication.job_status}`);
      break;

    case 'TAG_RETENTION':
      console.log(`Tag retention finished: ${data && data.retention && data.retention.result}`);
      break;

    default:
      console.log(`Unhandled Harbor event type: ${type}`);
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type Harbor uses.
app.post('/webhooks/harbor', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyHarborRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
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

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Harbor webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyHarborRequest = verifyHarborRequest;
module.exports.normalize = normalize;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/harbor`);
  });
}
