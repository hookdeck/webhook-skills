import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { POST } from '../app/webhooks/pganalyze/route';

// Standard Webhooks secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';
const OTHER_SECRET = 'whsec_b3RoZXJfc2VjcmV0X2tleQ==';

// Standard Webhooks algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

function send(
  payload: string,
  opts: {
    msgId?: string;
    timestamp?: string;
    signature?: string;
    headers?: Record<string, string>;
    contentType?: string;
    prefix?: 'svix' | 'webhook';
  } = {}
) {
  const msgId = opts.msgId ?? `msg_${crypto.randomBytes(12).toString('hex')}`;
  const timestamp = opts.timestamp ?? now();
  const prefix = opts.prefix ?? 'webhook';
  const headers: Record<string, string> = opts.headers ?? {
    [`${prefix}-id`]: msgId,
    [`${prefix}-timestamp`]: timestamp,
    [`${prefix}-signature`]: opts.signature ?? sign(payload, msgId, timestamp),
  };
  return POST(
    new Request('http://localhost:3000/webhooks/pganalyze', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

// Body shape and event names as documented at https://pganalyze.com/docs/checks/webhooks
function envelope(type: string, issueState = 'triggered') {
  return JSON.stringify({
    type,
    id: '6f1c9a8e-2b3d-4e5f-9a1b-2c3d4e5f6a7b',
    timestamp: '2026-10-14T17:02:11Z',
    version: 1,
    organization: { id: '9a8e6f1c-9a1b-4e5f-2b3d-2c3f6a7bd4e5', slug: 'acme' },
    data: {
      endpoint: { id: '42', name: 'Ops alert router' },
      issue: {
        id: '12345',
        severity: 'critical',
        state: issueState,
        checkKind: 'queries/slowness',
        description: 'Slow queries on prod-db',
        url: 'https://app.pganalyze.com/databases/678/checks/queries/slowness/12345',
      },
      server: { id: 'abc123xyz', name: 'prod-db', tags: { env: 'production' } },
      database: { id: '678', name: 'app_production' },
      alertRules: [{ id: '7', name: 'Prod alerts' }],
      alertDestinations: [{ id: '9', name: 'SRE Team' }],
    },
  });
}

const events: [string, string][] = [
  ['issue.triggered', 'triggered'],
  ['issue.escalated', 'triggered'],
  ['issue.downgraded', 'triggered'],
  ['issue.acknowledged', 'acknowledged'],
  ['issue.reopened', 'triggered'],
  ['issue.resolved', 'resolved'],
  ['ping', 'triggered'],
];

describe('pganalyze webhook handler', () => {
  beforeEach(() => {
    process.env.PGANALYZE_WEBHOOK_SECRET = TEST_SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.each(events)('handles %s', async (type, state) => {
    const res = await send(envelope(type, state));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type });
  });

  test('acknowledges an event type it does not handle', async () => {
    const res = await send(envelope('issue.snoozed'));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('issue.snoozed');
  });

  test('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const res = await send(envelope('issue.triggered'), { prefix: 'svix' });
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('issue.triggered');
  });

  test('prefers the webhook-* headers when both sets are present', async () => {
    const payload = envelope('issue.triggered');
    const timestamp = now();
    const res = await send(payload, {
      headers: {
        'webhook-id': 'msg_both',
        'webhook-timestamp': timestamp,
        'webhook-signature': sign(payload, 'msg_both', timestamp),
        'svix-id': 'msg_other',
        'svix-timestamp': timestamp,
        'svix-signature': 'v1,AAAA',
      },
    });
    expect(res.status).toBe(200);
  });

  test('verifies the raw bytes whatever the content type', async () => {
    const res = await send(envelope('issue.triggered'), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  test('verifies the exact raw bytes, including odd whitespace', async () => {
    const payload =
      '{ "type" : "issue.triggered",\n "id":"evt_1", "data":{"issue":{"id":"1"}, "server" : {"name":"db"}} }';
    const res = await send(payload);
    expect(res.status).toBe(200);
  });

  test('accepts any matching v1 entry and ignores other versions', async () => {
    const payload = envelope('issue.escalated');
    const msgId = 'msg_multi';
    const timestamp = now();
    const good = sign(payload, msgId, timestamp);
    const bad = sign(payload, msgId, timestamp, OTHER_SECRET);
    const res = await send(payload, { msgId, timestamp, signature: `v1a,ignored ${bad} ${good}` });
    expect(res.status).toBe(200);
  });

  test('rejects a missing signature header', async () => {
    const res = await send(envelope('issue.triggered'), {
      headers: { 'webhook-id': 'msg_1', 'webhook-timestamp': now() },
    });
    expect(res.status).toBe(400);
  });

  test('rejects a request with no webhook headers', async () => {
    const res = await send(envelope('issue.triggered'), { headers: {} });
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const res = await send(envelope('issue.triggered'), { signature: 'v1,aW52YWxpZA==' });
    expect(res.status).toBe(401);
  });

  test('rejects a signature made with another secret', async () => {
    const payload = envelope('issue.triggered');
    const msgId = 'msg_other_secret';
    const timestamp = now();
    const res = await send(payload, { msgId, timestamp, signature: sign(payload, msgId, timestamp, OTHER_SECRET) });
    expect(res.status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(envelope('issue.triggered'), msgId, timestamp);
    const res = await send(envelope('issue.resolved'), { msgId, timestamp, signature });
    expect(res.status).toBe(401);
  });

  test('rejects a stale timestamp (library window is 5 minutes)', async () => {
    const payload = envelope('issue.triggered');
    const msgId = 'msg_stale';
    const timestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await send(payload, { msgId, timestamp });
    expect(res.status).toBe(401);
  });

  test('returns 400 for a verified body that is not JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
  });

  test('fails closed when the secret is not configured', async () => {
    delete process.env.PGANALYZE_WEBHOOK_SECRET;
    const res = await send(envelope('issue.triggered'));
    expect(res.status).toBe(500);
  });

  test('fails closed when the secret is not a whsec_ secret', async () => {
    process.env.PGANALYZE_WEBHOOK_SECRET = 'not-a-whsec-secret';
    const res = await send(envelope('issue.triggered'));
    expect(res.status).toBe(500);
  });
});
