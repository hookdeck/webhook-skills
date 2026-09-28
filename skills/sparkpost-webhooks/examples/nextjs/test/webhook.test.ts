import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';

// Credentials YOUR endpoint defines and SparkPost is configured with. They are
// NOT SparkPost account credentials. These match the API reference's own
// `auth_credentials` example.
const TEST_USERNAME = 'basicauthuser';
const TEST_PASSWORD = 'mypassword';

// The documented `auth_request_details.body` example values.
const TEST_CLIENT_ID = 'CLIENT123';
const TEST_CLIENT_SECRET = '9sdfj791d2bsbf';

// The deprecated `auth_token` → X-MessageSystems-Webhook-Token value.
const TEST_LEGACY_TOKEN = 'existing-webhook-token';

process.env.SPARKPOST_WEBHOOK_USERNAME = TEST_USERNAME;
process.env.SPARKPOST_WEBHOOK_PASSWORD = TEST_PASSWORD;
process.env.SPARKPOST_OAUTH_CLIENT_ID = TEST_CLIENT_ID;
process.env.SPARKPOST_OAUTH_CLIENT_SECRET = TEST_CLIENT_SECRET;
process.env.SPARKPOST_WEBHOOK_TOKEN = TEST_LEGACY_TOKEN;

// Import after env vars are set
import { POST, GET } from '../app/webhooks/sparkpost/route';
import { POST as TOKEN_POST } from '../app/oauth/token/route';
import {
  verifyBasicAuth,
  authenticateRequest,
  _setToken,
} from '../lib/sparkpost-auth';

/** Build the RFC 7617 header exactly as SparkPost does. */
function basic(username = TEST_USERNAME, password = TEST_PASSWORD, scheme = 'Basic'): string {
  const encoded = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
  return `${scheme} ${encoded}`;
}

let batchCounter = 0;
/** Unique batch id per request so the dedupe cache doesn't swallow tests. */
function nextBatchId(): string {
  batchCounter += 1;
  return `6f4b3d2a-1e5c-4d7a-9f8b-${String(batchCounter).padStart(12, '0')}`;
}

interface PostOptions {
  authorization?: string;
  legacyToken?: string;
  batchId?: string | null;
}

function buildRequest(body: unknown, opts: PostOptions = {}): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (opts.authorization !== undefined) headers.set('Authorization', opts.authorization);
  if (opts.legacyToken !== undefined) headers.set('X-MessageSystems-Webhook-Token', opts.legacyToken);
  const batchId = opts.batchId === undefined ? nextBatchId() : opts.batchId;
  if (batchId !== null) headers.set('X-MessageSystems-Batch-ID', batchId);

  return new NextRequest('http://localhost:3000/webhooks/sparkpost', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function post(body: unknown, opts: PostOptions = {}) {
  return POST(buildRequest(body, opts));
}

function tokenRequest(body: Record<string, string>, contentType = 'application/json'): NextRequest {
  const payload =
    contentType === 'application/json'
      ? JSON.stringify(body)
      : new URLSearchParams(body).toString();

  return new NextRequest('http://localhost:3000/oauth/token', {
    method: 'POST',
    headers: new Headers({ 'content-type': contentType }),
    body: payload,
  });
}

// ---------------------------------------------------------------------------
// Real documented payloads, taken from SparkPost's Events Documentation
// endpoint sample values (api.sparkpost.com/api/v1/webhooks/events/documentation).
// Note that numeric-looking fields are STRINGS.
// ---------------------------------------------------------------------------

const DELIVERY_BATCH = [
  {
    msys: {
      message_event: {
        type: 'delivery',
        event_id: '92356927693813856',
        timestamp: '1460989507',
        message_id: '000443ee14578172be22',
        transmission_id: '65832150921904138',
        rcpt_to: 'recipient@example.com',
        raw_rcpt_to: 'recipient@example.com',
        campaign_id: 'Example Campaign Name',
        subaccount_id: '101',
        customer_id: '1',
        friendly_from: 'sender@example.com',
        subject: 'Summer deals are here!',
        template_id: 'templ-1234',
        num_retries: '2',
        queue_time: '12',
        msg_size: '1337',
        open_tracking: true,
        click_tracking: true,
        rcpt_meta: { customKey: 'customValue' },
        rcpt_tags: ['male', 'US'],
      },
    },
  },
];

const BOUNCE_BATCH = [
  {
    msys: {
      message_event: {
        type: 'bounce',
        event_id: '92356927693813856',
        timestamp: '1460989507',
        message_id: '000443ee14578172be22',
        transmission_id: '65832150921904138',
        rcpt_to: 'recipient@example.com',
        bounce_class: '1',
        error_code: '554',
        reason: 'MAIL REFUSED - IP (a.b.c.d) is in black list',
        raw_reason: 'MAIL REFUSED - IP (17.99.99.99) is in black list',
        subaccount_id: '101',
      },
    },
  },
];

// A batch that MIXES event classes — batches "may vary from 1 to 350 or more
// events" and are not restricted to one wrapper key.
const MIXED_BATCH = [
  DELIVERY_BATCH[0],
  {
    msys: {
      track_event: {
        type: 'click',
        event_id: '92356927693813856',
        timestamp: '1460989507',
        message_id: '000443ee14578172be22',
        rcpt_to: 'recipient@example.com',
        target_link_url: 'http://example.com',
        target_link_name: 'Example Link Name',
        user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_3) AppleWebKit/537.36',
        geo_ip: { city: 'Columbia', country: 'US', region: 'MD' },
      },
    },
  },
  {
    msys: {
      gen_event: {
        type: 'generation_failure',
        event_id: '92356927693813856',
        timestamp: '1460989507',
        error_code: '554',
        reason: 'MAIL REFUSED - IP (a.b.c.d) is in black list',
        rcpt_to: 'recipient@example.com',
        template_id: 'templ-1234',
      },
    },
  },
  {
    msys: {
      unsubscribe_event: {
        type: 'list_unsubscribe',
        event_id: '92356927693813856',
        timestamp: '1460989507',
        rcpt_to: 'recipient@example.com',
        campaign_id: 'Example Campaign Name',
        mailfrom: 'recipient@example.com',
      },
    },
  },
  {
    msys: {
      ab_test_event: {
        type: 'ab_test_completed',
        event_id: '0e5cf1fc-cb36-4c39-b695-3651b6ea6563',
        timestamp: '1460989507',
        ab_test: {
          id: 'password-reset',
          name: 'Password Reset',
          version: 1,
          winning_template_id: 'templ-1234',
          engagement_metric: 'count_unique_clicked',
        },
      },
    },
  },
  {
    msys: {
      ingest_event: {
        type: 'success',
        event_id: '0e5cf1fc-cb36-4c39-b695-3651b6ea6563',
        timestamp: '1460989507',
        batch_id: '96500f4d-d4f4-4f1b-8080-02f4682184bb',
        number_succeeded: 500,
        number_duplicates: 350,
      },
    },
  },
];

// The documented sample batch sent by POST /api/v1/webhooks/{id}/validate and by
// the test POST fired when a webhook is created or its target URL changes.
const VALIDATION_BATCH = [{ msys: {} }];

// Inbound email, delivered by the SEPARATE relay webhooks API.
const RELAY_MESSAGE_BATCH = [
  {
    msys: {
      relay_message: {
        content: {
          email_rfc822: 'From: sender@example.com\r\nSubject: Hello\r\n\r\nHello',
          email_rfc822_is_base64: false,
          subject: 'Hello',
          text: 'Hello',
          to: ['inbound@parse.example.com'],
        },
        customer_id: '1',
        friendly_from: 'sender@example.com',
        msg_from: 'sender@example.com',
        rcpt_to: 'inbound@parse.example.com',
        webhook_id: '4839201967643219',
        protocol: 'smtp',
      },
    },
  },
];

describe('SparkPost webhook: Basic authentication', () => {
  it('accepts a batch with valid Basic credentials', async () => {
    const res = await post(DELIVERY_BATCH, { authorization: basic() });
    expect(res.status).toBe(200);
  });

  it('accepts a lowercase `basic` scheme (RFC 7617 is case-insensitive)', async () => {
    const res = await post(DELIVERY_BATCH, {
      authorization: basic(TEST_USERNAME, TEST_PASSWORD, 'basic'),
    });
    expect(res.status).toBe(200);
  });

  it('rejects the wrong password with 401', async () => {
    const res = await post(DELIVERY_BATCH, { authorization: basic(TEST_USERNAME, 'wrong-password') });
    expect(res.status).toBe(401);
  });

  it('rejects the wrong username with 401', async () => {
    const res = await post(DELIVERY_BATCH, { authorization: basic('wronguser', TEST_PASSWORD) });
    expect(res.status).toBe(401);
  });

  it('rejects a missing Authorization header with 401', async () => {
    const res = await post(DELIVERY_BATCH);
    expect(res.status).toBe(401);
  });

  it('sets WWW-Authenticate on a 401', async () => {
    const res = await post(DELIVERY_BATCH);
    expect(res.headers.get('www-authenticate')).toBe('Basic realm="sparkpost"');
  });

  it('rejects malformed base64 (no colon after decoding) with 401', async () => {
    const res = await post(DELIVERY_BATCH, { authorization: 'Basic !!!not-base64!!!' });
    expect(res.status).toBe(401);
  });

  it('rejects base64 that decodes without a colon with 401', async () => {
    const encoded = Buffer.from('nocolonhere', 'utf8').toString('base64');
    const res = await post(DELIVERY_BATCH, { authorization: `Basic ${encoded}` });
    expect(res.status).toBe(401);
  });

  it('rejects the wrong scheme (Bearer-with-basic-payload) with 401', async () => {
    const encoded = Buffer.from(`${TEST_USERNAME}:${TEST_PASSWORD}`, 'utf8').toString('base64');
    const res = await post(DELIVERY_BATCH, { authorization: `Bearer ${encoded}` });
    expect(res.status).toBe(401);
  });

  it('rejects a scheme with no credentials with 401', async () => {
    const res = await post(DELIVERY_BATCH, { authorization: 'Basic' });
    expect(res.status).toBe(401);
  });
});

describe('verifyBasicAuth (unit)', () => {
  it('splits on the FIRST colon only, so passwords may contain colons', () => {
    const password = 'pa:ss:word';
    const header = `Basic ${Buffer.from(`${TEST_USERNAME}:${password}`).toString('base64')}`;
    expect(verifyBasicAuth(header, TEST_USERNAME, password)).toBe(true);
  });

  it('accepts an EMPTY password — `password` is not a required field', () => {
    const header = `Basic ${Buffer.from(`${TEST_USERNAME}:`).toString('base64')}`;
    expect(verifyBasicAuth(header, TEST_USERNAME, '')).toBe(true);
    expect(verifyBasicAuth(header, TEST_USERNAME, undefined)).toBe(true);
  });

  it('rejects a non-empty password when an empty one is configured', () => {
    const header = `Basic ${Buffer.from(`${TEST_USERNAME}:something`).toString('base64')}`;
    expect(verifyBasicAuth(header, TEST_USERNAME, '')).toBe(false);
  });

  it('fails closed when no username is configured', () => {
    expect(verifyBasicAuth(basic(), undefined, undefined)).toBe(false);
    expect(verifyBasicAuth(basic(), '', '')).toBe(false);
  });

  it('never throws on a length mismatch', () => {
    const header = `Basic ${Buffer.from('a:b').toString('base64')}`;
    expect(() => verifyBasicAuth(header, 'a-much-longer-username', 'and-a-longer-password')).not.toThrow();
    expect(verifyBasicAuth(header, 'a-much-longer-username', 'and-a-longer-password')).toBe(false);
  });
});

describe('SparkPost webhook: OAuth 2.0 Bearer tokens', () => {
  it('issues a token for valid client credentials sent as JSON', async () => {
    const res = await TOKEN_POST(
      tokenRequest({
        client_id: TEST_CLIENT_ID,
        client_secret: TEST_CLIENT_SECRET,
        grant_type: 'client_credentials',
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.access_token).toBe('string');
    expect(body.token_type).toBe('Bearer');
    expect(body.expires_in).toBe(3600);
  });

  it('issues a token for form-encoded client credentials too (Content-Type is undocumented)', async () => {
    const res = await TOKEN_POST(
      tokenRequest(
        {
          client_id: TEST_CLIENT_ID,
          client_secret: TEST_CLIENT_SECRET,
          grant_type: 'client_credentials',
        },
        'application/x-www-form-urlencoded'
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.access_token).toBe('string');
  });

  it('rejects wrong client credentials with 401 invalid_client', async () => {
    const res = await TOKEN_POST(
      tokenRequest({
        client_id: TEST_CLIENT_ID,
        client_secret: 'wrong-secret',
        grant_type: 'client_credentials',
      })
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('invalid_client');
  });

  it('rejects an unsupported grant_type with 400', async () => {
    const res = await TOKEN_POST(
      tokenRequest({
        client_id: TEST_CLIENT_ID,
        client_secret: TEST_CLIENT_SECRET,
        grant_type: 'password',
      })
    );
    expect(res.status).toBe(400);
  });

  it('accepts a batch with a valid Bearer token', async () => {
    const tokenRes = await TOKEN_POST(
      tokenRequest({
        client_id: TEST_CLIENT_ID,
        client_secret: TEST_CLIENT_SECRET,
        grant_type: 'client_credentials',
      })
    );
    const { access_token } = await tokenRes.json();
    const res = await post(DELIVERY_BATCH, { authorization: `Bearer ${access_token}` });
    expect(res.status).toBe(200);
  });

  it('rejects an unknown Bearer token with 401', async () => {
    const res = await post(DELIVERY_BATCH, { authorization: 'Bearer not-a-real-token' });
    expect(res.status).toBe(401);
  });

  it('rejects an EXPIRED Bearer token with 401 (which is what makes SparkPost refresh)', async () => {
    _setToken('expired-token', Date.now() - 1000);
    const res = await post(DELIVERY_BATCH, { authorization: 'Bearer expired-token' });
    // 401 (not 403): "SparkPost assumes a token is expired if the webhook
    // endpoint returns a response of 400 or 401" and then requests a new one.
    expect(res.status).toBe(401);
  });
});

describe('SparkPost webhook: legacy X-MessageSystems-Webhook-Token', () => {
  it('accepts the configured legacy token', async () => {
    const res = await post(DELIVERY_BATCH, { legacyToken: TEST_LEGACY_TOKEN });
    expect(res.status).toBe(200);
  });

  it('rejects a wrong legacy token with 401', async () => {
    const res = await post(DELIVERY_BATCH, { legacyToken: 'wrong-token' });
    expect(res.status).toBe(401);
  });
});

describe('SparkPost webhook: fail closed when unconfigured', () => {
  const keys = [
    'SPARKPOST_WEBHOOK_USERNAME',
    'SPARKPOST_WEBHOOK_PASSWORD',
    'SPARKPOST_OAUTH_CLIENT_ID',
    'SPARKPOST_OAUTH_CLIENT_SECRET',
    'SPARKPOST_WEBHOOK_TOKEN',
  ];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('rejects with 500 when no credentials at all are configured', async () => {
    const res = await post(DELIVERY_BATCH, { authorization: basic() });
    // 500, not 401: an operator misconfiguration, distinguishable in logs from a
    // bad caller. It must never be 200.
    expect(res.status).toBe(500);
  });

  it('never returns 200 for an unauthenticated batch when unconfigured', async () => {
    const res = await post(DELIVERY_BATCH);
    expect(res.status).not.toBe(200);
  });

  it('authenticateRequest reports the unconfigured state directly', () => {
    const result = authenticateRequest(new Headers(), {} as NodeJS.ProcessEnv);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
  });
});

describe('SparkPost webhook: payload handling', () => {
  it('returns 200 for the [{"msys":{}}] validation batch', async () => {
    // A non-200 here blocks webhook creation entirely (HTTP 400 from the Webhooks
    // API), so this is the single most important payload test.
    const res = await post(VALIDATION_BATCH, { authorization: basic() });
    expect(res.status).toBe(200);
  });

  it('handles a batch mixing message_event, track_event, gen_event, unsubscribe_event, ab_test_event and ingest_event', async () => {
    const res = await post(MIXED_BATCH, { authorization: basic() });
    expect(res.status).toBe(200);
  });

  it('handles a bounce event', async () => {
    const res = await post(BOUNCE_BATCH, { authorization: basic() });
    expect(res.status).toBe(200);
  });

  it('handles a relay_message entry (inbound email from relay webhooks)', async () => {
    const res = await post(RELAY_MESSAGE_BATCH, { authorization: basic() });
    expect(res.status).toBe(200);
  });

  it('returns 200 for an unknown event type (payloads change additively)', async () => {
    const res = await post([{ msys: { message_event: { type: 'some_future_event', event_id: '1' } } }], {
      authorization: basic(),
    });
    expect(res.status).toBe(200);
  });

  it('returns 200 for an unknown event class', async () => {
    const res = await post([{ msys: { future_event_class: { type: 'whatever' } } }], {
      authorization: basic(),
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await post('{not json', { authorization: basic() });
    expect(res.status).toBe(400);
  });

  it('authenticates BEFORE parsing — bad credentials with a bad body still give 401', async () => {
    const res = await post('{not json', { authorization: basic(TEST_USERNAME, 'wrong') });
    expect(res.status).toBe(401);
  });

  it('returns 400 when the body is not an array or object', async () => {
    const res = await post('"just a string"', { authorization: basic() });
    expect(res.status).toBe(400);
  });
});

describe('SparkPost webhook: batch idempotency', () => {
  it('returns 200 for a duplicate X-MessageSystems-Batch-ID without reprocessing', async () => {
    const batchId = nextBatchId();
    const first = await post(DELIVERY_BATCH, { authorization: basic(), batchId });
    const second = await post(DELIVERY_BATCH, { authorization: basic(), batchId });
    expect(first.status).toBe(200);
    // A duplicate batch must still be acknowledged, or SparkPost keeps retrying.
    expect(second.status).toBe(200);
  });

  it('reads the batch id header case-insensitively', async () => {
    const batchId = nextBatchId();
    const headers = new Headers({
      'content-type': 'application/json',
      Authorization: basic(),
      // The support docs spell it X-Messagesystems-Batch-Id; the API reference
      // X-MessageSystems-Batch-ID. Both must work.
      'x-messagesystems-batch-id': batchId,
    });
    const first = await POST(
      new NextRequest('http://localhost:3000/webhooks/sparkpost', {
        method: 'POST',
        headers,
        body: JSON.stringify(DELIVERY_BATCH),
      })
    );
    const second = await post(DELIVERY_BATCH, { authorization: basic(), batchId });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it('accepts a batch with no batch id header at all', async () => {
    const res = await post(DELIVERY_BATCH, { authorization: basic(), batchId: null });
    expect(res.status).toBe(200);
  });
});

describe('GET liveness probe', () => {
  it('responds ok', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('ok');
  });
});
