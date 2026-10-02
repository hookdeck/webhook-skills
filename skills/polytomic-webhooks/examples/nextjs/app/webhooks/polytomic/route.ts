// Generated with: polytomic-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Polytomic Webhook destination receiver (Next.js App Router).
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
//      Note: crypto.createHmac / createHash are called NOWHERE in this file.
//
//   2. `Polytomic-Signature-Timestamp` IS NOT A SIGNATURE, despite its name. It
//      carries only an RFC 3339 / ISO 8601 UTC timestamp ("2021-06-01T22:55:36Z")
//      — not a Unix epoch integer and not a digest. Parse it with `new Date()`,
//      NEVER parseInt(). The freshness check below is defence-in-depth only: the
//      timestamp is not covered by any signature, so an attacker holding the
//      bearer token can set any value they like.
//
//   3. EVERY PAYLOAD IS A BATCH. `object.records` is "a list of the records
//      changed since the last payload" — default batch size 100, and
//      user-configurable. We always loop. Never assume one record.
//
// Because there is no signature, there is NO raw-body requirement here — we can
// use `request.json()` directly rather than `request.text()`. (Polytomic may gzip
// the body; Next.js and your reverse proxy decompress that transparently.)

/** Default freshness window, in seconds — the docs' "more than a few minutes old". */
const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * `records[].fields` "contains each of the fields you selected to be delivered"
 * — THE KEYS ARE USER-DEFINED by the sync configuration. The `email` /
 * `last_login` in the docs' example are that customer's chosen fields, NOT a
 * Polytomic schema. So this is deliberately an open record type, never a fixed
 * interface.
 */
export type PolytomicFields = Record<string, unknown>;

export interface PolytomicRecord {
  /**
   * "a computed hash of the record's fields key/values pairs, which may be useful
   * for deduplicating incoming data" — i.e. an idempotency key. Its algorithm and
   * length are undocumented, so never recompute or assume them, and NEVER use it
   * for authentication: it is a digest over data Polytomic is sending you.
   */
  hash: string | null;
  fields: PolytomicFields;
}

export interface ParsedEnvelope {
  ok: true;
  event: string;
  /** The UUID of the SYNC — it matches the id in the Polytomic UI's URL bar. */
  syncId: string | null;
  /** The sync's name — "useful for discriminating against data coming in from different endpoints." */
  syncName: string | null;
  records: unknown[];
  /** May be an object, null, or absent (Advanced settings -> Metadata defaults to null). */
  metadata: Record<string, unknown> | null;
}

export interface ParseError {
  ok: false;
  error: string;
}

function webhookSecret(): string {
  // Read per request rather than at module load, so the fail-closed path stays
  // testable and a restart isn't needed after a rotation.
  return process.env.POLYTOMIC_WEBHOOK_SECRET || '';
}

function toleranceSeconds(): number {
  const raw = process.env.POLYTOMIC_TIMESTAMP_TOLERANCE_SECONDS;
  if (raw === undefined || raw === '') return DEFAULT_TOLERANCE_SECONDS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_TOLERANCE_SECONDS;
}

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
 * give you, it carries no `exp`, and the docs call it "a static value". Compare
 * the whole string byte-for-byte.
 *
 * @returns null when unconfigured — the caller MUST fail closed with 500.
 */
export function verifyBearerToken(
  authorizationHeader: string | null | undefined,
  secret: string | undefined
): boolean | null {
  if (!secret) return null; // unset => fail closed, never silently accept
  if (typeof authorizationHeader !== 'string') return false;

  // Strip exactly ONE leading "Bearer " prefix. The scheme is case-insensitive
  // per RFC 7235; the token after it is not. An anchored, non-global replacement
  // strips at most one prefix.
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
 * than you expect (more than a few minutes old)." But the timestamp is NOT
 * covered by any signature, so this proves nothing about authenticity — it only
 * limits replay of an OLD CAPTURED REQUEST.
 *
 * The value is RFC 3339 UTC, e.g. "2021-06-01T22:55:36Z". NEVER parseInt() it:
 * parseInt("2021-06-01T22:55:36Z") returns 2021, which looks plausible and
 * silently breaks the check.
 *
 * @param tolerance seconds; <= 0 disables the check
 */
export function timestampIsFresh(
  timestampHeader: string | null | undefined,
  tolerance: number = toleranceSeconds()
): boolean {
  if (tolerance <= 0) return true; // check disabled
  if (typeof timestampHeader !== 'string' || timestampHeader.trim() === '') return false;

  const sent = new Date(timestampHeader.trim());
  if (Number.isNaN(sent.getTime())) return false;

  return Math.abs(Date.now() - sent.getTime()) <= tolerance * 1000;
}

/**
 * Defensive validation of the documented envelope.
 *
 * `object` is "an envelope that will contain the payload, regardless of event"
 * and is always present. `metadata` defaults to null in the sync configuration,
 * so it may be an object, null, OR ABSENT — all three are handled.
 */
export function parseEnvelope(payload: unknown): ParsedEnvelope | ParseError {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ok: false, error: 'payload is not a JSON object' };
  }

  const body = payload as Record<string, unknown>;

  if (typeof body.event !== 'string' || body.event === '') {
    return { ok: false, error: 'missing or invalid event' };
  }

  const objectValue = body.object;
  if (typeof objectValue !== 'object' || objectValue === null || Array.isArray(objectValue)) {
    return { ok: false, error: 'missing or invalid object envelope' };
  }

  const envelope = objectValue as Record<string, unknown>;

  // `records` is absent on event types we don't know about yet, so it is only
  // required for sync.records.
  if (envelope.records !== undefined && !Array.isArray(envelope.records)) {
    return { ok: false, error: 'object.records is not an array' };
  }

  const metadata = envelope.metadata;

  return {
    ok: true,
    event: body.event,
    syncId: typeof envelope.id === 'string' ? envelope.id : null,
    syncName: typeof envelope.name === 'string' ? envelope.name : null,
    records: Array.isArray(envelope.records) ? envelope.records : [],
    metadata:
      typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : null,
  };
}

/**
 * Normalize one record from the batch.
 *
 * `fields` keys come from the user's sync configuration, so access them
 * defensively — any key may be absent and any value may be null.
 *
 * @returns null if the record is unusable
 */
export function normalizeRecord(record: unknown): PolytomicRecord | null {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) return null;

  const r = record as Record<string, unknown>;
  const rawFields = r.fields;

  const fields: PolytomicFields =
    typeof rawFields === 'object' && rawFields !== null && !Array.isArray(rawFields)
      ? (rawFields as PolytomicFields)
      : {};

  return {
    hash: typeof r.hash === 'string' && r.hash !== '' ? r.hash : null,
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
 * In production, hand this to a queue — the route returns 200 first. A 4xx/5xx
 * "will cause the sync to appear as a failure", so a slow downstream would fail
 * your customer's whole sync run.
 */
function handleSyncRecords(envelope: ParsedEnvelope): void {
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
    const fieldNames = Object.keys(record.fields);
    console.log(
      `  record ${record.hash ?? '(no hash)'}: ${fieldNames.length} field(s) ` +
        `[${fieldNames.join(', ')}]`
    );
  }
}

export async function POST(request: NextRequest) {
  // 1. Fail closed when no secret is configured. On a provider with NO
  //    signature, the bearer token is the entire security boundary — treating
  //    "unconfigured" as "accept everything" leaves a fully open endpoint that
  //    looks secure.
  const authResult = verifyBearerToken(
    request.headers.get('authorization'),
    webhookSecret()
  );
  if (authResult === null) {
    console.error('Polytomic webhook refused: POLYTOMIC_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }
  if (authResult === false) {
    console.error('Polytomic webhook rejected: bearer token mismatch');
    return NextResponse.json({ error: 'Invalid bearer token' }, { status: 401 });
  }

  // 2. Optional freshness check. Defence-in-depth only — see timestampIsFresh.
  if (!timestampIsFresh(request.headers.get('polytomic-signature-timestamp'))) {
    console.error('Polytomic webhook rejected: stale or unparseable timestamp');
    return NextResponse.json({ error: 'Stale or invalid timestamp' }, { status: 400 });
  }

  // 3. Parse the body. No signature means no raw-body requirement.
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    console.error('Polytomic webhook rejected: invalid JSON body');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const envelope = parseEnvelope(payload);
  if (!envelope.ok) {
    console.error(`Polytomic webhook rejected: ${envelope.error}`);
    return NextResponse.json({ error: envelope.error }, { status: 400 });
  }

  // 4. Dispatch on the event type. There is EXACTLY ONE documented event:
  //    sync.records. "You should only process webhooks you know about—for right
  //    now, that is just the sync.records event."
  //
  //    In a real deployment, enqueue here and let the worker do the work, so the
  //    200 below is returned immediately. "On receipt of the payload, your API
  //    should return 200 OK. Any 4xx or 5xx error will cause the sync to appear
  //    as a failure", and no retry policy is documented.
  switch (envelope.event) {
    case 'sync.records':
      handleSyncRecords(envelope);
      break;

    default:
      // IGNORE unknown events — do NOT error. The docs explicitly anticipate
      // future event types, and a 4xx would mark the customer's sync run failed.
      console.log(`Polytomic webhook: ignoring unknown event "${envelope.event}"`);
      break;
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
