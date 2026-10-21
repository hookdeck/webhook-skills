// Generated with: rubrik-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Authentication
//
// RUBRIK SECURITY CLOUD WEBHOOKS ARE NOT SIGNED. There is no HMAC, no
// signature header and no signing secret. Instead the webhook carries a
// credential chosen with `authInfo.authType` (AuthenticationTypeV2):
//
//   CUSTOM_HEADER  -> <headerKey>: <headerValue>        (recommended)
//   BEARER         -> Authorization: Bearer <token>
//   BASIC          -> Authorization: Basic base64(user:pass)
//
// OAUTH2 (client-credentials against your IdP) and URL (token in the URL) are
// not handled here. Configure at least one mode below; with none configured
// every request is rejected (fail closed).
// ---------------------------------------------------------------------------

// The header name is whatever you set as `headerKey` in Rubrik. Express
// lowercases incoming header names, so compare in lowercase.
const HEADER_NAME = (process.env.RUBRIK_WEBHOOK_HEADER_NAME || 'X-Rubrik-Webhook-Token').toLowerCase();

/**
 * Constant-time string compare. Hashing both sides first gives two 32-byte
 * buffers, so crypto.timingSafeEqual never throws on a length mismatch and
 * the length of the secret isn't leaked.
 */
function secureEquals(a, b) {
  return crypto.timingSafeEqual(
    crypto.createHash('sha256').update(String(a), 'utf8').digest(),
    crypto.createHash('sha256').update(String(b), 'utf8').digest()
  );
}

/** Parse `Authorization: <scheme> <value>` (scheme is case-insensitive). */
function parseAuthorization(header) {
  if (!header) return null;
  const match = /^(\S+)\s+(.+)$/.exec(header.trim());
  if (!match) return null;
  return { scheme: match[1].toLowerCase(), value: match[2].trim() };
}

function verifyBasic(authorization, username, password) {
  const parsed = parseAuthorization(authorization);
  if (!parsed || parsed.scheme !== 'basic') return false;
  const decoded = Buffer.from(parsed.value, 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon === -1) return false;
  // Split on the FIRST colon only: passwords may contain colons. Compare both
  // halves even if the first fails, so timing doesn't reveal which was wrong.
  const userOk = secureEquals(decoded.slice(0, colon), username);
  const passOk = secureEquals(decoded.slice(colon + 1), password || '');
  return userOk && passOk;
}

/**
 * Returns the auth mode that matched ('custom_header' | 'bearer' | 'basic'),
 * or null if the request is unauthenticated.
 */
function authenticateRequest(headers, env = process.env) {
  const secret = env.RUBRIK_WEBHOOK_SECRET;
  const headerName = (env.RUBRIK_WEBHOOK_HEADER_NAME || 'X-Rubrik-Webhook-Token').toLowerCase();
  const bearerToken = env.RUBRIK_WEBHOOK_BEARER_TOKEN;
  const username = env.RUBRIK_WEBHOOK_USERNAME;
  const authorization = headers.authorization;

  // CUSTOM_HEADER: compare the whole header value. If you chose
  // `Authorization` as the header key, the value includes any scheme you
  // typed (e.g. "Bearer abc"), so put that full string in RUBRIK_WEBHOOK_SECRET.
  if (secret) {
    const value = headers[headerName];
    if (typeof value === 'string' && secureEquals(value, secret)) return 'custom_header';
  }

  // BEARER: Rubrik sends the `token` field as `Authorization: Bearer <token>`.
  if (bearerToken) {
    const parsed = parseAuthorization(authorization);
    if (parsed && parsed.scheme === 'bearer' && secureEquals(parsed.value, bearerToken)) {
      return 'bearer';
    }
  }

  // BASIC: Rubrik sends `userCredentials` as an RFC 7617 Basic header.
  if (username && verifyBasic(authorization, username, env.RUBRIK_WEBHOOK_PASSWORD)) {
    return 'basic';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Payload handling
//
// The default payload is PagerDuty Common Event Format (PD-CEF):
//   { summary, source, severity, timestamp, class, custom_details: { id, type,
//     objectName, objectType, status, eventName, clusterName, ... } }
// Custom JSON templates can produce any shape, so normalize defensively: read
// `custom_details` when present, otherwise treat the top level as flat.
// ---------------------------------------------------------------------------

function normalizeEvent(payload) {
  const details = payload.custom_details && typeof payload.custom_details === 'object'
    ? payload.custom_details
    : payload;
  return {
    id: details.id || payload.id,
    activityType: details.type || payload.type, // "Event" for events
    eventClass: payload.class || details.class, // e.g. "Backup", "Anomaly"
    status: details.status || payload.status, // e.g. "Failure", "Success"
    severity: payload.severity || details.severity, // e.g. "critical"
    message: payload.summary || payload.message || details.message,
    objectName: details.objectName,
    objectType: details.objectType,
    eventName: details.eventName, // e.g. "Snapshot.BackupFailed"
    clusterName: details.clusterName,
  };
}

function handleEvent(event) {
  // Status values come from Rubrik's ActivityStatusEnum.
  switch (event.status) {
    case 'Failure':
    case 'TaskFailure':
      console.log(`[rubrik] FAILED ${event.eventClass} on ${event.objectName}: ${event.message}`);
      // TODO: open an incident / page on-call
      break;
    case 'Success':
    case 'TaskSuccess':
      console.log(`[rubrik] Succeeded ${event.eventClass} on ${event.objectName}`);
      // TODO: record successful backup / recovery
      break;
    case 'PARTIAL_SUCCESS':
    case 'Warning':
      console.log(`[rubrik] Warning ${event.eventClass} on ${event.objectName}: ${event.message}`);
      break;
    case 'Canceled':
    case 'Canceling':
      console.log(`[rubrik] Canceled ${event.eventClass} on ${event.objectName}`);
      break;
    case 'Running':
    case 'Queued':
    case 'Info':
      console.log(`[rubrik] ${event.status}: ${event.message}`);
      break;
    default:
      console.log(`[rubrik] Unhandled status ${event.status}: ${event.message}`);
  }

  // Anomaly (ransomware) events deserve attention regardless of status.
  if (event.eventClass === 'Anomaly') {
    console.log(`[rubrik] ANOMALY detected on ${event.objectName}: ${event.message}`);
    // TODO: alert the security team
  }
}

// Raw body for every content type: the payload is a template you control, so
// parse it ourselves and return 400 on malformed JSON.
app.post('/webhooks/rubrik', express.raw({ type: '*/*' }), (req, res) => {
  const mode = authenticateRequest(req.headers);
  if (!mode) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  const event = normalizeEvent(payload);
  try {
    handleEvent(event);
  } catch (err) {
    console.error('[rubrik] handler error', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // Rubrik retries only 3 times (1s, 5s, 10s) and auto-disables the webhook
  // after 25 consecutive failures, so respond quickly.
  return res.status(200).json({ received: true, id: event.id || null });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Rubrik webhook receiver listening on http://localhost:${PORT}/webhooks/rubrik`);
    console.log(`Custom auth header: ${HEADER_NAME}`);
  });
}

module.exports = { app, authenticateRequest, normalizeEvent, secureEquals };
