// Generated with: roblox-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Roblox webhook notifications carry a `roblox-signature` header:
//
//   roblox-signature: t=<unix seconds>,v1=<signature>
//
// v1 = base64( HMAC-SHA256( key = webhook secret, message = "<t>.<raw body>" ) )
//
// The timestamp is part of the signed message, so it can't be altered without
// breaking the HMAC. That's what makes the replay-window check meaningful.
// If the webhook has no secret in the Creator Dashboard, Roblox sends only
// `t=<timestamp>` and there is nothing to authenticate: we reject those.
// ---------------------------------------------------------------------------

// Roblox's runnable sample uses a 300 s window; its prose suggests up to 10 minutes.
const DEFAULT_TOLERANCE_SECONDS = 300;

function toleranceSeconds() {
  const value = Number(process.env.ROBLOX_WEBHOOK_TOLERANCE_SECONDS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TOLERANCE_SECONDS;
}

/**
 * Parse `t=...,v1=...`. It's a CSV of key=value members: don't assume their
 * order or that there are only two. Split each member on the FIRST `=` only,
 * because base64 signatures end in `=` padding.
 */
function parseRobloxSignatureHeader(header) {
  const parsed = { timestamp: null, signatures: [] };
  for (const member of String(header || '').split(',')) {
    const index = member.indexOf('=');
    if (index === -1) continue;
    const key = member.slice(0, index).trim();
    const value = member.slice(index + 1).trim();
    if (key === 't') parsed.timestamp = value;
    else if (key === 'v1' && value) parsed.signatures.push(value);
  }
  return parsed;
}

/**
 * Verify a Roblox webhook notification against the exact bytes Roblox sent.
 * @param {Buffer|string} rawBody - the raw request body (NOT re-serialised JSON)
 * @param {string|undefined} header - the roblox-signature header
 * @param {string|undefined} secret - ROBLOX_WEBHOOK_SECRET
 * @param {{ tolerance?: number, now?: number }} [options] - now in ms
 * @returns {{ valid: true, timestamp: number } | { valid: false, reason: string }}
 */
function verifyRobloxSignature(rawBody, header, secret, options = {}) {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE_SECONDS;
  const now = options.now ?? Date.now();

  if (!secret) return { valid: false, reason: 'secret_not_configured' };
  if (!header) return { valid: false, reason: 'missing_header' };

  const { timestamp, signatures } = parseRobloxSignatureHeader(header);
  if (!timestamp || !/^\d+$/.test(timestamp)) return { valid: false, reason: 'missing_timestamp' };
  // No v1 means the webhook was saved without a secret. Never treat that as
  // "skip verification": it's exactly what a forged request would look like.
  if (signatures.length === 0) return { valid: false, reason: 'missing_v1' };

  // t is Unix time in SECONDS.
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > tolerance) {
    return { valid: false, reason: 'timestamp_outside_tolerance' };
  }

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody ?? '', 'utf8');
  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('base64')
  );
  const matched = signatures.some((signature) => {
    const candidate = Buffer.from(signature);
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
  return matched ? { valid: true, timestamp: Number(timestamp) } : { valid: false, reason: 'signature_mismatch' };
}

/**
 * EventTime has 7 fractional digits ("2023-12-30T16:24:24.2118874Z"). Trim to
 * milliseconds before handing it to Date.
 */
function parseEventTime(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/(\.\d{3})\d+/, '$1');
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ---------------------------------------------------------------------------
// Acknowledge first, process later. Roblox needs a 2xx within 5 seconds and
// gives up on the URL after 5 failed attempts. These two stand-ins keep the
// example self-contained: in production use a database unique constraint (or
// Redis SET NX with a TTL) and a durable queue (SQS, BullMQ, Cloud Tasks...).
// ---------------------------------------------------------------------------

// NotificationId: "If the same NotificationId is received twice, it is considered a duplicate."
const seenNotificationIds = new Set();

const jobQueue = {
  enqueue(job) {
    setImmediate(() => {
      processJob(job).catch((err) => console.error(`Job ${job.type} failed:`, err));
    });
  },
};

// Map each start place ID in GameIds to the data store entries that hold that
// user's data. Empty by default, so the example deletes nothing.
//   { 111111111: { universeId: 222222222, entries: [{ datastoreName: 'PlayerData', scope: 'global', entryKey: 'Player_{userId}' }] } }
const ERASURE_TARGETS = {};

async function deleteStandardDataStoreEntry(universeId, { datastoreName, scope, entryKey }) {
  // Open Cloud Data Stores API. ROBLOX_OPEN_CLOUD_API_KEY is an Open Cloud API
  // key with the data stores "Delete Entry" permission: a different credential
  // from the webhook secret.
  const url = new URL(
    `https://apis.roblox.com/datastores/v1/universes/${universeId}/standard-datastores/datastore/entries/entry`
  );
  url.search = new URLSearchParams({ datastoreName, scope, entryKey }).toString();
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'x-api-key': process.env.ROBLOX_OPEN_CLOUD_API_KEY },
  });
  // 404 means there was nothing to delete, which also satisfies the request.
  if (!res.ok && res.status !== 404) throw new Error(`Data store delete failed: ${res.status}`);
}

async function processJob(job) {
  if (job.type !== 'erase-user') return;
  for (const startPlaceId of job.gameIds) {
    const target = ERASURE_TARGETS[startPlaceId];
    if (!target) continue;
    for (const entry of target.entries) {
      const entryKey = entry.entryKey.replace('{userId}', String(job.userId));
      await deleteStandardDataStoreEntry(target.universeId, { ...entry, entryKey });
    }
  }
  // Record completion (who, which games, when) in your compliance log here.
  console.log(`Erasure complete for notification ${job.notificationId}`);
}

/**
 * Route on EventType. Only RightToErasureRequest, SampleNotification and
 * AnalyticsAlert have published wire values. Roblox doesn't publish the
 * EventType strings for the Subscription, Commerce, Transaction Refunded or
 * Early Harm Detection triggers, so they land in `default`: log the EventType
 * from a real delivery, then add a case for it.
 */
function handleNotification(notification) {
  const payload = notification.EventPayload || {};

  switch (notification.EventType) {
    case 'RightToErasureRequest': {
      // Legal obligation: delete this user's personal data for these games.
      // GameIds are start place IDs. Queue it: never do the deletion inline.
      jobQueue.enqueue({
        type: 'erase-user',
        notificationId: notification.NotificationId,
        userId: payload.UserId,
        gameIds: Array.isArray(payload.GameIds) ? payload.GameIds : [],
      });
      console.log(`Right to erasure request queued for ${(payload.GameIds || []).length} game(s)`);
      return 'erasure_queued';
    }

    case 'SampleNotification':
      // Sent by the Test Response button in the Creator Dashboard.
      console.log(`Sample notification received (UserId ${payload.UserId})`);
      return 'sample_received';

    case 'AnalyticsAlert': {
      // Analytics alerts: AlertMessage is itself a JSON string.
      let alert = {};
      try {
        alert = JSON.parse(payload.AlertMessage || '{}');
      } catch {
        // Keep going: the notification is authentic even if the inner message isn't JSON.
      }
      console.log(`Analytics alert for ${payload.TargetType} ${payload.TargetId}: ${alert.summary || '(no summary)'}`);
      return 'alert_received';
    }

    default:
      // Includes the Subscription, Commerce, Transaction Refunded and Early Harm
      // Detection triggers, whose wire names Roblox doesn't publish. Return 2xx
      // so Roblox doesn't retry and eventually disable the URL. For Commerce
      // Product Order Paid, also dedupe on the commerce order ID (Roblox warns
      // that duplicates are possible).
      console.log(
        `Unhandled EventType "${notification.EventType}" (EventPayload keys: ${Object.keys(payload).join(', ')})`
      );
      return 'unhandled';
  }
}

// express.raw() keeps the exact bytes for the HMAC: don't put express.json() in front of it.
app.post('/webhooks/roblox', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secret = process.env.ROBLOX_WEBHOOK_SECRET;
  if (!secret) {
    console.error('ROBLOX_WEBHOOK_SECRET is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const result = verifyRobloxSignature(rawBody, req.get('roblox-signature'), secret, {
    tolerance: toleranceSeconds(),
  });
  if (!result.valid) {
    if (result.reason === 'missing_v1') {
      console.error('roblox-signature has no v1: set a secret on this webhook in the Creator Dashboard');
    }
    return res.status(401).json({ error: 'Invalid signature', reason: result.reason });
  }

  let notification;
  try {
    notification = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!notification || typeof notification.EventType !== 'string') {
    return res.status(400).json({ error: 'Missing EventType' });
  }

  const { NotificationId: notificationId, EventType: eventType } = notification;
  if (notificationId && seenNotificationIds.has(notificationId)) {
    return res.status(200).json({ received: true, duplicate: true, notificationId, eventType });
  }

  const eventTime = parseEventTime(notification.EventTime);
  console.log(`Roblox ${eventType} ${notificationId} at ${eventTime ? eventTime.toISOString() : notification.EventTime}`);

  const action = handleNotification(notification);
  if (notificationId) seenNotificationIds.add(notificationId);

  return res.status(200).json({ received: true, notificationId, eventType, action });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Roblox webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/roblox`);
  });
}

module.exports = {
  app,
  verifyRobloxSignature,
  parseRobloxSignatureHeader,
  parseEventTime,
  handleNotification,
  jobQueue,
  seenNotificationIds,
  DEFAULT_TOLERANCE_SECONDS,
};
