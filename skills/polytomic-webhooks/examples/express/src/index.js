// Generated with: polytomic-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

// Polytomic Webhook destination receiver.
//
// Polytomic is a data-movement platform. Its one outbound-HTTP surface is the
// Webhook *connection used as a sync destination*: you add a Webhook connection,
// point a Model Sync at it, and Polytomic POSTs BATCHES OF CHANGED RECORDS to
// your URL on the sync's schedule. This is not event subscription — there is no
// event-subscription UI and no per-event-type toggles.
//
// Three things make Polytomic unlike most providers:
//
//   1. THERE IS NO SIGNATURE. No HMAC, no digest, no signing secret, no
//      signature header, and no X-Polytomic-* header of any kind. The ONLY
//      authentication is a STATIC SHARED BEARER TOKEN matching the connection
//      Secret. Verbatim from the docs: "This should be a 'Bearer' token matching
//      the same value that was provided as the 'Secret' during connection setup.
//      For now, this is the only request authorization and is a static value."
//      Note: crypto.createHmac / createHash appear NOWHERE in this file. There
//      is nothing to HMAC and nothing to compare a digest against.
//
//   2. `Polytomic-Signature-Timestamp` IS NOT A SIGNATURE, despite its name. It
//      carries only an RFC 3339 / ISO 8601 UTC timestamp ("2021-06-01T22:55:36Z")
//      — not a Unix epoch integer and not a digest. Parse it with `new Date()`,
//      NEVER parseInt(). We use it for an optional freshness check, which is
//      defence-in-depth only: the timestamp is not covered by any signature, so
//      an attacker holding the bearer token can set any value they like.
//
//   3. EVERY PAYLOAD IS A BATCH. `object.records` is "a list of the records
//      changed since the last payload" — default batch size 100, and
//      user-configurable. We always loop. Never assume one record.
//
// Because there is no signature, there is NO raw-body requirement here —
// express.json() is fine. (Polytomic may gzip the body; Express/your proxy
// decompresses that transparently.)

// REQUIRED. The connection Secret. Read from the environment per request rather
// than captured at module load, so the fail-closed path stays testable and a
// restart isn't needed after a rotation.
const webhookSecret = () => process.env.POLYTOMIC_WEBHOOK_SECRET || '';
if (!webhookSecret()) {
  console.warn(
    'POLYTOMIC_WEBHOOK_SECRET is not set — the webhook route will fail closed ' +
      'with 500. Polytomic does not sign its payloads, so this shared bearer ' +
      'token is the ONLY authentication available. Reveal it by hovering the ' +
      'secret key field on the Webhook connection in Polytomic.'
  );
}

// OPTIONAL. Freshness tolerance in seconds for Polytomic-Signature-Timestamp.
// Default 300 ("more than a few minutes old", per the docs). 0 disables.
const DEFAULT_TOLERANCE_SECONDS = 300;
function toleranceSeconds() {
  const raw = process.env.POLYTOMIC_TIMESTAMP_TOLERANCE_SECONDS;
  if (raw === undefined || raw === '') return DEFAULT_TOLERANCE_SECONDS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_TOLERANCE_SECONDS;
}

const app = express();

/**
 * Authenticate the request by comparing the Authorization bearer token against
 * the connection Secret, in constant time.
 *
 * This is the WHOLE of Polytomic's authentication. There is no signature to
 * verify: no HMAC is computed here, because no signature header is sent.
 *
 * The documented sample token happens to decode as an HS256 JWT (claims
 * {"aud":"webhook","jti":"<uuid>","iss":"https://app.polytomic-local.com:8443/"}
 * — `iss` is the issuing Polytomic instance, and the docs' example is a local dev
 * host). Do NOT treat it as a JWT: it is signed with a key Polytomic does not
 * give you, it carries no `exp`, and the docs call it "a static value". Calling
 * jwt.verify()/jwt.decode() or checking aud/iss/exp would either throw or add a
 * false sense of security. Compare the whole string byte-for-byte.
 *
 * @param {unknown} authorizationHeader - the raw Authorization header value
 * @param {string} secret - POLYTOMIC_WEBHOOK_SECRET
 * @returns {boolean|null} null when unconfigured — the caller MUST fail closed
 */
function verifyBearerToken(authorizationHeader, secret) {
  if (!secret) return null; // unset => fail closed, never silently accept
  if (typeof authorizationHeader !== 'string') return false;

  // Strip exactly ONE leading "Bearer " prefix. The scheme is case-insensitive
  // per RFC 7235; the token after it is not. An anchored, non-global replacement
  // strips at most one prefix, so a token that itself starts with "Bearer"
  // survives intact.
  const token = authorizationHeader.replace(/^Bearer /i, '');

  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  // Length-guard first: crypto.timingSafeEqual throws on unequal buffer lengths,
  // and the attacker controls the incoming length.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Optional freshness check on Polytomic-Signature-Timestamp.
 *
 * The docs endorse this: "In general, it is a good idea to reject requests older
 * than you expect (more than a few minutes old)." But be clear about what it
 * buys you — the timestamp is NOT covered by any signature, so this proves
 * nothing about authenticity. It only limits replay of an OLD CAPTURED REQUEST.
 *
 * The value is RFC 3339 UTC, e.g. "2021-06-01T22:55:36Z". NEVER parseInt() it:
 * parseInt("2021-06-01T22:55:36Z") returns 2021, which looks like a plausible
 * number and silently breaks the check.
 *
 * @param {unknown} timestampHeader - the raw Polytomic-Signature-Timestamp value
 * @param {number} tolerance - seconds; <= 0 disables the check
 * @returns {boolean}
 */
function timestampIsFresh(timestampHeader, tolerance = toleranceSeconds()) {
  if (tolerance <= 0) return true; // check disabled
  if (typeof timestampHeader !== 'string' || timestampHeader.trim() === '') return false;

  const sent = new Date(timestampHeader.trim());
  if (Number.isNaN(sent.getTime())) return false;

  return Math.abs(Date.now() - sent.getTime()) <= tolerance * 1000;
}

/**
 * Defensive validation of the documented envelope.
 *
 * Documented shape:
 *   { "event": "sync.records",
 *     "object": { "id": "<sync uuid>", "name": "<sync name>",
 *                 "records": [ { "hash": "...", "fields": { ... } } ],
 *                 "metadata": { } } }
 *
 * `object` is "an envelope that will contain the payload, regardless of event"
 * and is always present. `metadata` defaults to null in the sync configuration,
 * so it may be an object, null, OR ABSENT — all three are handled.
 *
 * @param {unknown} payload
 * @returns {{ok: true, event: string, syncId: string|null, syncName: string|null,
 *            records: unknown[], metadata: object|null}
 *          | {ok: false, error: string}}
 */
function parseEnvelope(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ok: false, error: 'payload is not a JSON object' };
  }
  if (typeof payload.event !== 'string' || payload.event === '') {
    return { ok: false, error: 'missing or invalid event' };
  }

  const object = payload.object;
  if (typeof object !== 'object' || object === null || Array.isArray(object)) {
    return { ok: false, error: 'missing or invalid object envelope' };
  }

  // `records` is absent on event types we don't know about yet, so it is only
  // required for sync.records — validated by the route after dispatch.
  if (object.records !== undefined && !Array.isArray(object.records)) {
    return { ok: false, error: 'object.records is not an array' };
  }

  return {
    ok: true,
    event: payload.event,
    // The UUID of the SYNC (it matches the id in the Polytomic UI's URL bar for
    // that sync config) — not of the delivery or the record.
    syncId: typeof object.id === 'string' ? object.id : null,
    // The sync's name: "useful for discriminating against data coming in from
    // different endpoints."
    syncName: typeof object.name === 'string' ? object.name : null,
    records: Array.isArray(object.records) ? object.records : [],
    // Absent / null / object all collapse to null-or-object here.
    metadata:
      typeof object.metadata === 'object' &&
      object.metadata !== null &&
      !Array.isArray(object.metadata)
        ? object.metadata
        : null,
  };
}

/**
 * Normalize one record from the batch.
 *
 * `fields` "contains each of the fields you selected to be delivered" — THE KEYS
 * ARE USER-DEFINED by the sync configuration. The `email` / `last_login` in the
 * docs' example are that customer's chosen fields, NOT a Polytomic schema. So
 * this is deliberately NOT modelled as a fixed shape; access it defensively.
 *
 * `hash` is "a computed hash of the record's fields key/values pairs, which may
 * be useful for deduplicating incoming data" — i.e. an idempotency key. Its
 * algorithm and length are undocumented, so never recompute or assume them, and
 * NEVER use it for authentication: it is a digest over data Polytomic is sending
 * you, computed by Polytomic.
 *
 * @param {unknown} record
 * @returns {{hash: string|null, fields: Record<string, unknown>}|null} null if unusable
 */
function normalizeRecord(record) {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) return null;

  const fields =
    typeof record.fields === 'object' && record.fields !== null && !Array.isArray(record.fields)
      ? record.fields
      : {};

  return {
    hash: typeof record.hash === 'string' && record.hash !== '' ? record.hash : null,
    fields,
  };
}

/**
 * Handle the sync.records batch.
 *
 * ALWAYS LOOPS. Default batch size is 100 ("Webhook batch size (default: 100)"
 * under the sync's Advanced settings) and it is user-configurable, so never
 * assume one record and write for large batches.
 *
 * In production, do this work ASYNCHRONOUSLY — the route acknowledges with 200
 * first. A 4xx/5xx "will cause the sync to appear as a failure", so a slow
 * downstream would fail your customer's whole sync run.
 *
 * @param {ReturnType<typeof parseEnvelope> & {ok: true}} envelope
 */
function handleSyncRecords(envelope) {
  console.log(
    `Polytomic sync.records: sync "${envelope.syncName ?? 'unknown'}" ` +
      `(${envelope.syncId ?? 'no id'}) delivered ${envelope.records.length} record(s)`
  );

  if (envelope.metadata) {
    // Hardcoded key/values from Advanced settings -> Metadata (default: null).
    console.log(`  metadata: ${JSON.stringify(envelope.metadata)}`);
  }

  for (const raw of envelope.records) {
    const record = normalizeRecord(raw);
    if (!record) {
      console.warn('  skipping malformed record in batch');
      continue;
    }

    // TODO: replace with your own processing, and dedupe on
    // `${envelope.syncId}:${record.hash}` so a redelivered batch is a no-op.
    // The field KEYS below come from the sync configuration, so read them
    // defensively — any key may be absent and any value may be null.
    const fieldNames = Object.keys(record.fields);
    console.log(
      `  record ${record.hash ?? '(no hash)'}: ${fieldNames.length} field(s) ` +
        `[${fieldNames.join(', ')}]`
    );
  }
}

app.post('/webhooks/polytomic', express.json(), (req, res) => {
  // 1. Fail closed when no secret is configured. On a provider with NO
  //    signature, the bearer token is the entire security boundary — treating
  //    "unconfigured" as "accept everything" leaves a fully open endpoint that
  //    looks secure.
  const authResult = verifyBearerToken(req.get('authorization'), webhookSecret());
  if (authResult === null) {
    console.error('Polytomic webhook refused: POLYTOMIC_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }
  if (authResult === false) {
    console.error('Polytomic webhook rejected: bearer token mismatch');
    return res.status(401).json({ error: 'Invalid bearer token' });
  }

  // 2. Optional freshness check. Defence-in-depth only — see timestampIsFresh.
  if (!timestampIsFresh(req.get('polytomic-signature-timestamp'))) {
    console.error('Polytomic webhook rejected: stale or unparseable timestamp');
    return res.status(400).json({ error: 'Stale or invalid timestamp' });
  }

  // 3. Validate the envelope. express.json() has already turned invalid JSON
  //    into a 400 via the error handler below.
  const envelope = parseEnvelope(req.body);
  if (!envelope.ok) {
    console.error(`Polytomic webhook rejected: ${envelope.error}`);
    return res.status(400).json({ error: envelope.error });
  }

  // 4. Acknowledge FAST, then process. "On receipt of the payload, your API
  //    should return 200 OK. Any 4xx or 5xx error will cause the sync to appear
  //    as a failure." No retry policy or schedule is documented, so a failed
  //    run is an operational problem — don't risk it on a slow downstream.
  res.status(200).json({ received: true });

  // 5. Dispatch on the event type. There is EXACTLY ONE documented event:
  //    sync.records. "You should only process webhooks you know about—for right
  //    now, that is just the sync.records event."
  switch (envelope.event) {
    case 'sync.records':
      handleSyncRecords(envelope);
      break;

    default:
      // IGNORE unknown events — do NOT error. The docs explicitly anticipate
      // future event types, and a 4xx would mark the customer's sync run as
      // failed. We already sent 200 above.
      console.log(`Polytomic webhook: ignoring unknown event "${envelope.event}"`);
      break;
  }
});

// express.json() throws on a malformed body — turn that into a 400 rather than a
// 500. Must be registered after the route.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    console.error('Polytomic webhook rejected: invalid JSON body');
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  return next(err);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helpers for testing
module.exports = {
  app,
  verifyBearerToken,
  timestampIsFresh,
  parseEnvelope,
  normalizeRecord,
};

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/polytomic`);
  });
}
