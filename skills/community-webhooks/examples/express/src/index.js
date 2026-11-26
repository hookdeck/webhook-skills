// Generated with: community-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

// Community's docs specify NO tolerance window for the signature timestamp, so
// the staleness check is OFF by default. Enabling it is your own hardening
// choice — keep any window well above an hour, since Community retries a failed
// delivery for up to an hour from the first attempt.
const TOLERANCE_SECONDS = parseInt(
  process.env.COMMUNITY_WEBHOOK_TOLERANCE_SECONDS || '0',
  10
);

/**
 * Parse a `community-signature` header of the form `t=<unix>,v1=<hex>`.
 *
 * Splits on `,` then on the first `=` so field order does not matter. Only the
 * `v1` scheme is defined; any other version is treated as unsupported.
 *
 * @param {string} header
 * @returns {{ timestamp: string, signature: string } | null}
 */
function parseSignatureHeader(header) {
  const fields = {};
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    fields[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }

  const timestamp = fields.t;
  const signature = fields.v1;
  if (!timestamp || !signature) return null;

  return { timestamp, signature };
}

/**
 * Verify a Community webhook signature.
 *
 * Community signs `{timestamp}.{raw_body}` with HMAC-SHA256 using the webhook's
 * signature secret and sends the result as
 * `community-signature: t=<unix_seconds>,v1=<lowercase_hex>`.
 *
 * @param {string|Buffer} rawBody - Raw request body (never re-serialized JSON)
 * @param {string|undefined} signatureHeader - `community-signature` header value
 * @param {string|undefined} secret - The webhook's signature secret
 * @param {number} toleranceSeconds - 0 disables the staleness check
 * @returns {boolean}
 */
function verifyCommunitySignature(
  rawBody,
  signatureHeader,
  secret,
  toleranceSeconds = TOLERANCE_SECONDS
) {
  if (!signatureHeader || !secret) return false;

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return false;

  const { timestamp, signature } = parsed;

  // Optional staleness check (not a documented Community requirement)
  if (toleranceSeconds > 0) {
    const ts = Number.parseInt(timestamp, 10);
    if (Number.isNaN(ts)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSeconds) {
      return false;
    }
  }

  // Signed content is the timestamp, a literal ".", then the RAW body
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`, 'utf8')
    .digest('hex');

  // Hex is case-insensitive (0xAB === 0xab). Community's documented example is
  // lowercase, but normalize both sides before comparing rather than rejecting a
  // valid uppercase digest. `expected` is already lowercase — digest('hex') emits lowercase.
  // Constant-time comparison; timingSafeEqual throws on a length mismatch
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

/**
 * Extract the event payload from a Community envelope.
 *
 * Every documented sample nests it at `data.object`, while the prose on the same
 * page describes `data.member` / `data.message`. Prefer the samples, fall back
 * defensively.
 */
function extractObject(event) {
  const data = event?.data ?? {};
  return data.object ?? data.member ?? data.message ?? null;
}

// Deduplication store — Community delivers AT-LEAST-ONCE and documents that the
// same event can arrive more than once. Keep event ids for at least two hours, longer than the one-hour retry window.
// Replace with Redis/Postgres in production.
const DEDUPE_TTL_MS = 2 * 60 * 60 * 1000;
const seenEvents = new Map();

function alreadyProcessed(eventId) {
  const now = Date.now();
  for (const [id, seenAt] of seenEvents) {
    if (now - seenAt > DEDUPE_TTL_MS) seenEvents.delete(id);
  }
  if (seenEvents.has(eventId)) return true;
  seenEvents.set(eventId, now);
  return false;
}

// CRITICAL: express.raw() — Community signs the raw body, not parsed JSON
app.post(
  '/webhooks/community',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signatureHeader = req.headers['community-signature'];
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : String(req.body ?? '');

    if (!signatureHeader) {
      return res.status(400).send('Missing community-signature header');
    }

    if (
      !verifyCommunitySignature(
        rawBody,
        signatureHeader,
        process.env.COMMUNITY_WEBHOOK_SECRET
      )
    ) {
      console.error('Community signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Deduplicate before doing any work — messages especially should be handled
    // at-most-once (better to not send than to send twice).
    if (event.id && alreadyProcessed(event.id)) {
      console.log(`Duplicate event ${event.id} ignored`);
      return res.status(200).send('OK');
    }

    const object = extractObject(event);

    switch (event.type) {
      case 'message.inbound': {
        const member = object?.member ?? {};
        console.log(
          `Inbound message ${object?.id} from ${member.communication_channel_id}: ${object?.text}`
        );
        // Your code: route to support inbox, run keyword automations
        break;
      }

      case 'message.outbound': {
        // The sample shows "automated" while the documented list is
        // capitalized, so compare case-insensitively.
        const kind = (object?.outbound_message_type ?? '').toLowerCase();
        console.log(`Outbound message ${object?.id} (type: ${kind})`);
        // Your code: log conversation history, attribute campaign sends
        break;
      }

      case 'member.created':
        console.log(`Member created: ${object?.id}`);
        // Your code: welcome flow, create the contact in your CRM
        break;

      case 'member.updated':
        console.log(`Member updated: ${object?.id} (active: ${object?.active})`);
        // Your code: sync profile changes downstream
        break;

      case 'member.deleted':
        // Sparse payload: only id, active, timestamp, client_id,
        // communication_channel, and an emptied communication_channel_id.
        console.log(`Member deleted: ${object?.id}`);
        // Your code: downstream deletion
        break;

      case 'member.opted_out': {
        // The member unsubscribed (for example by replying STOP). A member.updated
        // event for the same member arrives too, so don't treat them as duplicates.
        const optOut = object?.opt_out ?? {};
        console.log(`Member opted out: ${object?.id} (source: ${optOut.source})`);
        // Your code: add to your suppression list
        break;
      }

      default:
        console.log(`Unhandled Community event type: ${event.type}`);
    }

    // Community requires a 2xx within 15 seconds — acknowledge fast and do the
    // real work asynchronously.
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyCommunitySignature, parseSignatureHeader };

// Start the server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(
      `Webhook endpoint: POST http://localhost:${PORT}/webhooks/community`
    );
  });
}
