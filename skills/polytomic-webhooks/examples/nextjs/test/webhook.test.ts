// Generated with: polytomic-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  POST,
  verifyBearerToken,
  timestampIsFresh,
  parseEnvelope,
  normalizeRecord,
} from '../app/webhooks/polytomic/route';

// Polytomic does NOT sign its webhooks, so there are NO SIGNATURES TO GENERATE
// in these tests — no HMAC, no digest, nothing to compute. The only credential
// is the static shared bearer token (the connection Secret), which Polytomic
// echoes back verbatim in the Authorization header.
//
// This value mirrors the shape of the token in Polytomic's documented example,
// which happens to decode as an HS256 JWT with claims
// {"aud":"webhook","jti":"<uuid>","iss":"https://app.polytomic-local.com:8443/"}.
// That is an observation about the documented example, not a documented format —
// the handler treats the whole string as an OPAQUE SECRET and never decodes it.
const SECRET =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJhdWQiOiJ3ZWJob29rIiwianRpIjoiMDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAwIiwiaXNzIjoiaHR0cHM6Ly9hcHAucG9seXRvbWljLWxvY2FsLmNvbTo4NDQzLyJ9.' +
  'FBSU_fC1YFyWhMSPErRono4BPfkIeT3MkRdZrepiP3c';
const WRONG_SECRET = SECRET.slice(0, -1) + 'X'; // same length, last char differs

process.env.POLYTOMIC_WEBHOOK_SECRET = SECRET;

const URL = 'http://localhost:3000/webhooks/polytomic';

/** RFC 3339 / ISO 8601 UTC, e.g. "2021-06-01T22:55:36Z" — the documented format. */
function rfc3339Now(offsetSeconds = 0): string {
  return new Date(Date.now() + offsetSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * The documented payload, verbatim from
 * https://docs.polytomic.com/docs/webhooks-connections
 *
 * `fields` holds `email` / `last_login` because that is what THAT customer's sync
 * selected — the keys are user-defined, not a Polytomic schema.
 */
function documentedPayload(): Record<string, any> {
  return {
    event: 'sync.records',
    object: {
      id: '1ea8f90a-b22e-4218-86d5-c3c109e1fbb7',
      name: 'Webhook HTTP Endpoint sync',
      records: [
        {
          hash: 'b7421c6c57bd49f7',
          fields: {
            email: 'nathan@polytomic.com',
            last_login: '2020-12-02T00:00:00Z',
          },
        },
      ],
      metadata: {},
    },
  };
}

interface RequestOptions {
  secret?: string | null;
  timestamp?: string | null;
  raw?: string;
}

function makeRequest(payload: Record<string, any> | null, options: RequestOptions = {}) {
  const { secret = SECRET, timestamp = rfc3339Now(), raw } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret !== null) headers['Authorization'] = `Bearer ${secret}`;
  if (timestamp !== null) headers['Polytomic-Signature-Timestamp'] = timestamp;

  return new NextRequest(URL, {
    method: 'POST',
    headers,
    body: raw !== undefined ? raw : JSON.stringify(payload),
  });
}

afterEach(() => {
  process.env.POLYTOMIC_WEBHOOK_SECRET = SECRET;
  delete process.env.POLYTOMIC_TIMESTAMP_TOLERANCE_SECONDS;
});

describe('bearer token authentication (there is no signature)', () => {
  it('accepts the documented payload with a matching bearer token', async () => {
    const res = await POST(makeRequest(documentedPayload()));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
  });

  it('rejects a mismatched token with 401', async () => {
    const res = await POST(makeRequest(documentedPayload(), { secret: WRONG_SECRET }));
    expect(res.status).toBe(401);
  });

  it('rejects a missing Authorization header with 401', async () => {
    const res = await POST(makeRequest(documentedPayload(), { secret: null }));
    expect(res.status).toBe(401);
  });

  it('fails CLOSED with 500 when POLYTOMIC_WEBHOOK_SECRET is unset', async () => {
    // On a provider with no signature, the bearer token is the entire security
    // boundary. "Unconfigured" must never mean "accept everything".
    delete process.env.POLYTOMIC_WEBHOOK_SECRET;
    const res = await POST(makeRequest(documentedPayload()));
    expect(res.status).toBe(500);
  });

  it('strips exactly one "Bearer " prefix, case-insensitively on the scheme', () => {
    // RFC 7235: the scheme is case-insensitive.
    expect(verifyBearerToken(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(verifyBearerToken(`bearer ${SECRET}`, SECRET)).toBe(true);
    expect(verifyBearerToken(`BEARER ${SECRET}`, SECRET)).toBe(true);
    // Only ONE prefix is stripped, so a doubled scheme must not authenticate.
    expect(verifyBearerToken(`Bearer Bearer ${SECRET}`, SECRET)).toBe(false);
  });

  it('accepts a bare token with no scheme', () => {
    expect(verifyBearerToken(SECRET, SECRET)).toBe(true);
  });

  it('compares the token case-SENSITIVELY', () => {
    expect(verifyBearerToken(`Bearer ${SECRET.toUpperCase()}`, SECRET)).toBe(false);
  });

  it('returns false rather than throwing on a length mismatch', () => {
    // crypto.timingSafeEqual throws on unequal buffer lengths, and the attacker
    // controls the incoming length — the length guard must come first.
    expect(verifyBearerToken('Bearer short', SECRET)).toBe(false);
    expect(verifyBearerToken(`Bearer ${SECRET}extra`, SECRET)).toBe(false);
  });

  it('returns null (not false) when the secret is unset, so callers can fail closed', () => {
    expect(verifyBearerToken(`Bearer ${SECRET}`, '')).toBe(null);
    expect(verifyBearerToken(`Bearer ${SECRET}`, undefined)).toBe(null);
  });

  it('returns false for a missing Authorization value', () => {
    expect(verifyBearerToken(null, SECRET)).toBe(false);
    expect(verifyBearerToken(undefined, SECRET)).toBe(false);
  });

  it('does not treat the token as a JWT', () => {
    // A JWT-aware verifier would reject this or crash. An opaque byte-for-byte
    // comparison accepts it, which is correct: real workspace secrets need not
    // be JWTs at all.
    const opaque = 'not-a-jwt-at-all-just-an-opaque-shared-secret';
    expect(verifyBearerToken(`Bearer ${opaque}`, opaque)).toBe(true);
  });
});

describe('Polytomic-Signature-Timestamp (a timestamp, NOT a signature)', () => {
  it('accepts a fresh RFC 3339 timestamp', () => {
    expect(timestampIsFresh(rfc3339Now(), 300)).toBe(true);
  });

  it('parses the documented format', () => {
    // The docs' example: "2021-06-01T22:55:36Z" — parseable, but long stale.
    expect(timestampIsFresh('2021-06-01T22:55:36Z', 0)).toBe(true); // check disabled
    expect(timestampIsFresh('2021-06-01T22:55:36Z', 300)).toBe(false); // genuinely stale
  });

  it('rejects a timestamp older than the tolerance', () => {
    expect(timestampIsFresh(rfc3339Now(-600), 300)).toBe(false);
  });

  it('rejects a timestamp too far in the future', () => {
    expect(timestampIsFresh(rfc3339Now(600), 300)).toBe(false);
  });

  it('is NOT parsed as a Unix epoch integer', () => {
    // parseInt("2021-06-01T22:55:36Z") === 2021 — a silent, catastrophic bug.
    const epochSeconds = String(Math.floor(Date.now() / 1000));
    expect(timestampIsFresh(epochSeconds, 300)).toBe(false);
  });

  it('rejects an unparseable value', () => {
    expect(timestampIsFresh('not-a-timestamp', 300)).toBe(false);
    expect(timestampIsFresh('', 300)).toBe(false);
    expect(timestampIsFresh(null, 300)).toBe(false);
  });

  it('skips the check entirely when the tolerance is 0 or negative', () => {
    expect(timestampIsFresh(null, 0)).toBe(true);
    expect(timestampIsFresh('garbage', 0)).toBe(true);
    expect(timestampIsFresh('garbage', -1)).toBe(true);
  });

  it('rejects a stale delivery with 400 over HTTP', async () => {
    const res = await POST(makeRequest(documentedPayload(), { timestamp: rfc3339Now(-3600) }));
    expect(res.status).toBe(400);
  });

  it('authenticates before checking freshness (a bad token is 401, not 400)', async () => {
    const res = await POST(
      makeRequest(documentedPayload(), { secret: WRONG_SECRET, timestamp: rfc3339Now(-3600) })
    );
    expect(res.status).toBe(401);
  });

  it('honours POLYTOMIC_TIMESTAMP_TOLERANCE_SECONDS=0 over HTTP', async () => {
    process.env.POLYTOMIC_TIMESTAMP_TOLERANCE_SECONDS = '0';
    const res = await POST(
      makeRequest(documentedPayload(), { timestamp: '2021-06-01T22:55:36Z' })
    );
    expect(res.status).toBe(200);
  });
});

describe('event dispatch (exactly one documented event: sync.records)', () => {
  it('processes sync.records', async () => {
    const res = await POST(makeRequest(documentedPayload()));
    expect(res.status).toBe(200);
  });

  it('IGNORES an unknown event with 200, rather than erroring', async () => {
    // The docs anticipate future event types. A 4xx/5xx "will cause the sync to
    // appear as a failure", so unknown events must be acknowledged.
    const payload = documentedPayload();
    payload.event = 'some.future.event';
    delete payload.object.records;
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
  });

  it('rejects a missing event field with 400', async () => {
    const payload = documentedPayload();
    delete payload.event;
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(400);
  });

  it('rejects a missing object envelope with 400', async () => {
    const res = await POST(makeRequest({ event: 'sync.records' }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON with 400', async () => {
    const res = await POST(makeRequest(null, { raw: '{not json' }));
    expect(res.status).toBe(400);
  });
});

describe('the batch (object.records is a LIST, default size 100)', () => {
  it('handles a multi-record batch', async () => {
    const payload = documentedPayload();
    payload.object.records = Array.from({ length: 250 }, (_, i) => ({
      hash: `hash${i}`,
      fields: { email: `user${i}@example.com`, last_login: '2020-12-02T00:00:00Z' },
    }));
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(200);

    const parsed = parseEnvelope(payload);
    expect(parsed.ok).toBe(true);
    // Batch size is user-configurable, so a handler must never assume 1.
    if (parsed.ok) expect(parsed.records).toHaveLength(250);
  });

  it('handles an empty batch', async () => {
    const payload = documentedPayload();
    payload.object.records = [];
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(200);
  });

  it('rejects a non-array records value with 400', async () => {
    const payload = documentedPayload();
    payload.object.records = 'not-an-array';
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(400);
  });

  it('exposes hash and the sync id for idempotency', () => {
    const parsed = parseEnvelope(documentedPayload());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.syncId).toBe('1ea8f90a-b22e-4218-86d5-c3c109e1fbb7');
    expect(parsed.syncName).toBe('Webhook HTTP Endpoint sync');
    // Dedupe key: `${syncId}:${hash}`. hash is a CONTENT digest for dedupe only
    // — never a credential.
    expect(normalizeRecord(parsed.records[0])?.hash).toBe('b7421c6c57bd49f7');
  });
});

describe('records[].fields has user-defined keys', () => {
  it('passes through whatever keys the sync selected', () => {
    // A completely different sync configuration — no `email`, no `last_login`.
    const record = normalizeRecord({
      hash: 'abc123',
      fields: { account_id: 42, mrr: 199.5, is_churned: false, plan: null },
    });
    expect(Object.keys(record!.fields).sort()).toEqual([
      'account_id',
      'is_churned',
      'mrr',
      'plan',
    ]);
    // Null values survive — the handler must tolerate them, not assume strings.
    expect(record!.fields.plan).toBe(null);
  });

  it('defaults fields to an empty object when absent or malformed', () => {
    expect(normalizeRecord({ hash: 'h' })!.fields).toEqual({});
    expect(normalizeRecord({ hash: 'h', fields: null })!.fields).toEqual({});
    expect(normalizeRecord({ hash: 'h', fields: 'nope' })!.fields).toEqual({});
    expect(normalizeRecord({ hash: 'h', fields: [] })!.fields).toEqual({});
  });

  it('tolerates a record with no hash', () => {
    expect(normalizeRecord({ fields: { a: 1 } })!.hash).toBe(null);
  });

  it('returns null for a non-object record', () => {
    expect(normalizeRecord(null)).toBe(null);
    expect(normalizeRecord('nope')).toBe(null);
    expect(normalizeRecord([])).toBe(null);
  });

  it('does not drop a batch because one record is malformed', async () => {
    const payload = documentedPayload();
    payload.object.records = [documentedPayload().object.records[0], null, 'nope'];
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(200);
  });
});

describe('object.metadata may be an object, null, or absent', () => {
  it('accepts an object (the documented example sends {})', () => {
    const base = parseEnvelope(documentedPayload());
    expect(base.ok && base.metadata).toEqual({});

    const payload = documentedPayload();
    payload.object.metadata = { env: 'production', tenant: 'acme' };
    const parsed = parseEnvelope(payload);
    expect(parsed.ok && parsed.metadata).toEqual({ env: 'production', tenant: 'acme' });
  });

  it('accepts null (the Advanced settings default)', () => {
    const payload = documentedPayload();
    payload.object.metadata = null;
    const parsed = parseEnvelope(payload);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.metadata).toBe(null);
  });

  it('accepts it being absent entirely', async () => {
    const payload = documentedPayload();
    delete payload.object.metadata;
    const parsed = parseEnvelope(payload);
    if (parsed.ok) expect(parsed.metadata).toBe(null);
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(200);
  });
});

describe('no HMAC anywhere in the verify path', () => {
  it('the route source contains no hashing calls', () => {
    // Polytomic sends no signature, so there is nothing to digest. A verifier
    // that computes an HMAC here is comparing against nothing.
    //
    // Match CALLS (with the paren), so the prose comments that name these
    // functions in order to forbid them don't trip the assertion.
    const source = readFileSync(
      resolve(__dirname, '../app/webhooks/polytomic/route.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/createHmac\s*\(/);
    expect(source).not.toMatch(/createHash\s*\(/);
  });
});
