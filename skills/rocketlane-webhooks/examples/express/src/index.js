// Generated with: rocketlane-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Strict base64 alphabet only, so valid credentials followed by junk are rejected.
const BASIC_HEADER = /^basic[ \t]+([A-Za-z0-9+/]+={0,2})$/i;

/**
 * Parse `Authorization: Basic base64(username:password)`. The scheme is
 * case-insensitive, the payload must be strict base64, and the split is on the
 * FIRST colon (the password may contain colons). Returns null if malformed.
 */
function parseBasicAuth(header) {
  if (typeof header !== 'string') return null;
  const match = BASIC_HEADER.exec(header.trim());
  if (!match || match[1].length % 4 !== 0) return null;
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.toString('base64') !== match[1]) return null; // non-canonical padding/bits
  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  const colon = decoded.indexOf(':');
  if (colon === -1) return null;
  return { username: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}

/**
 * Rocketlane does not sign payloads. The only authentication is HTTP Basic auth, which
 * must arrive on the first request (Hookdeck never answers with a 401 challenge). Both
 * the username and the password are compared before deciding, so there is no short-circuit.
 */
function verifyRocketlaneRequest(headers, config = process.env) {
  const expectedUser = config.ROCKETLANE_WEBHOOK_USERNAME;
  const expectedPass = config.ROCKETLANE_WEBHOOK_PASSWORD;
  if (!expectedUser || !expectedPass) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers['authorization']);
  if (!creds) return false;
  const userOk = safeEqual(creds.username, expectedUser);
  const passOk = safeEqual(creds.password, expectedPass);
  return userOk && passOk;
}

function handleEvent(payload) {
  switch (payload.eventType) {
    case 'TASK_CREATED':
      console.log(`Task created: ${payload.data?.task?.taskId} ${payload.data?.task?.taskName}`);
      // TODO: create the matching task in your system
      break;

    case 'TASK_UPDATED':
      console.log(`Task updated: ${payload.data?.task?.taskId}, changed: ${(payload.changeLog?.changedFields ?? []).join(', ')}`);
      // TODO: apply payload.changeLog.to to your copy of the task
      break;

    case 'TASK_DELETED':
      console.log(`Task deleted: ${payload.data?.task?.taskId}`);
      // TODO: remove the task from your system
      break;

    case 'PROJECT_CREATED':
    case 'PROJECT_UPDATED':
    case 'PROJECT_ARCHIVED':
    case 'PROJECT_DELETED':
      console.log(`${payload.eventType} (event ${payload.eventId})`);
      // TODO: sync the project
      break;

    case 'PHASE_CREATED':
    case 'PHASE_UPDATED':
    case 'PHASE_DELETED':
      console.log(`${payload.eventType} (event ${payload.eventId})`);
      // TODO: sync the phase
      break;

    default:
      console.log(`Unhandled Rocketlane event type: ${payload.eventType}`);
  }
}

// Read the body raw so the credential is checked before anything is parsed,
// whatever Content-Type Rocketlane uses.
app.post('/webhooks/rocketlane', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyRocketlaneRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Basic authentication' });
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
    console.error('Error handling Rocketlane webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // Rocketlane counts only 200 or 204 as delivered, and times out after 10 seconds.
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyRocketlaneRequest = verifyRocketlaneRequest;
module.exports.parseBasicAuth = parseBasicAuth;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/rocketlane`);
  });
}
