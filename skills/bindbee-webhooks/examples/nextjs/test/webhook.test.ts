import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST, HEAD } from '../app/webhooks/bindbee/route';

// Bindbee's secret has no prefix and is used as raw UTF-8 bytes (not base64-decoded)
const TEST_SECRET = 'k7Hq2xZp9RvLm4TnB8wYc3Ds5Fg1JeUa';

// base64(HMAC_SHA256(utf8(secret), `${id}.${timestamp}.${payload}`))
function sign(payload: string, timestamp: string, msgId: string, key: Buffer = Buffer.from(TEST_SECRET, 'utf8')): string {
  const sig = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();
const newId = () => crypto.randomUUID();

function makeRequest(payload: string, headers: Record<string, string>, contentType = 'application/json'): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/bindbee', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body: payload,
  });
}

function signedHeaders(payload: string, ts = now(), id = newId()) {
  return { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': sign(payload, ts, id) };
}

const connector = {
  id: '01a0a4c6-9807-7c4b-9705-e8359ac15030',
  integration: { name: 'BambooHR', slug: 'bamboohr' },
  category: 'HRIS',
  origin_id: 'prod_acme-inc_x1y2z3',
  connector_status: 'COMPLETE',
  name: 'Acme Inc',
  environment: 'production',
};
const sync = { sync_id: '01a0a9de-bda5-7512-b7a3-4ecb67abc77d', sync_type: 'AUTOMATED', sync_name: '#18' };

function event(name: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: newId(),
    event: name,
    version: '2026.10.06',
    sequence: 11,
    occurred_at: '2026-09-16T11:00:10.198843+00:00',
    webhook: { webhook_id: '01a0a417-ce39-7799-9565-993c95eec951', url: 'https://example.com/webhooks/bindbee', event: name },
    connector,
    data: [],
    sync,
    ...extra,
  });
}

const employeeCreated = () =>
  event('hris.employee.created', { model: 'employee', data: ['01a0a4fc-a046-76bf-bd66-16218012d4e7', '01a0a9de-e417-79e2-b989-2f2e13f47c31'] });

describe('Bindbee webhook handler', () => {
  beforeEach(() => {
    process.env.BINDBEE_WEBHOOK_SECRET = TEST_SECRET;
  });
  afterAll(() => {
    delete process.env.BINDBEE_WEBHOOK_SECRET;
  });

  test('accepts hris.employee.created', async () => {
    const p = employeeCreated();
    const res = await POST(makeRequest(p, signedHeaders(p)));
    expect(res.status).toBe(200);
    expect((await res.json()).event).toBe('hris.employee.created');
  });

  test('accepts hris.employee.updated', async () => {
    const p = event('hris.employee.updated', { model: 'employee', data: ['01a0a4fc-a046-76bf-bd66-16218012d4e7'] });
    const res = await POST(makeRequest(p, signedHeaders(p)));
    expect(res.status).toBe(200);
    expect((await res.json()).event).toBe('hris.employee.updated');
  });

  test.each(['connector.sync.started', 'connector.sync.completed', 'connector.linked', 'connector.relinked'])(
    'accepts %s',
    async (name) => {
      const p = event(name, { data: { id: connector.id, integration_name: 'bamboohr', category: 'HRIS', display_status: 'Syncing', last_sync_start_time: null } });
      const res = await POST(makeRequest(p, signedHeaders(p)));
      expect(res.status).toBe(200);
      expect((await res.json()).event).toBe(name);
    }
  );

  test.each(['connector.sync.failed', 'connector.relink_needed'])('accepts %s with an error object', async (name) => {
    const p = event(name, { error: { failed_at: '2026-09-16T12:01:41.784841+00:00', message: 'Received error response when validating the connection.', detail: {} } });
    const res = await POST(makeRequest(p, signedHeaders(p)));
    expect(res.status).toBe(200);
    expect((await res.json()).event).toBe(name);
  });

  test('accepts ats and lms data events and ignores unknown fields', async () => {
    for (const name of ['ats.application.updated', 'lms.enrollment.created']) {
      const p = event(name, { model: name.split('.')[1], data: ['id-1'], brand_new_field: { nested: true } });
      const res = await POST(makeRequest(p, signedHeaders(p)));
      expect(res.status).toBe(200);
    }
  });

  test('acknowledges an event it does not handle', async () => {
    const p = event('something.else');
    const res = await POST(makeRequest(p, signedHeaders(p)));
    expect(res.status).toBe(200);
  });

  test('verifies the raw bytes whatever the content type', async () => {
    const p = employeeCreated();
    const res = await POST(makeRequest(p, signedHeaders(p), 'text/plain'));
    expect(res.status).toBe(200);
  });

  test('treats a repeated event id as a duplicate', async () => {
    const p = employeeCreated();
    const first = await POST(makeRequest(p, signedHeaders(p)));
    const retry = await POST(makeRequest(p, signedHeaders(p, now(), JSON.parse(p).id)));
    expect((await first.json()).duplicate).toBeUndefined();
    expect(retry.status).toBe(200);
    expect((await retry.json()).duplicate).toBe(true);
  });

  test('uses the secret as raw UTF-8 bytes, not base64-decoded', async () => {
    const p = employeeCreated();
    const ts = now();
    const id = newId();
    const wrongKey = Buffer.from(TEST_SECRET, 'base64'); // what the standardwebhooks library would use
    const res = await POST(makeRequest(p, { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': sign(p, ts, id, wrongKey) }));
    expect(res.status).toBe(401);
  });

  test('base64-decodes the part after whsec_ when the secret has that prefix', async () => {
    const key = Buffer.from('another_secret_key_of_32_bytes!!');
    process.env.BINDBEE_WEBHOOK_SECRET = `whsec_${key.toString('base64')}`;
    const p = employeeCreated();
    const ts = now();
    const id = newId();
    const res = await POST(makeRequest(p, { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': sign(p, ts, id, key) }));
    expect(res.status).toBe(200);
  });

  test('accepts the same delivery signed with svix-* headers', async () => {
    const p = employeeCreated();
    const ts = now();
    const id = newId();
    const res = await POST(makeRequest(p, { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': sign(p, ts, id) }));
    expect(res.status).toBe(200);
  });

  test('accepts any matching v1 entry in a space-separated list and ignores other versions', async () => {
    const p = employeeCreated();
    const ts = now();
    const id = newId();
    const good = sign(p, ts, id);
    const res = await POST(
      makeRequest(p, { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,aW52YWxpZA== v1a,${good.slice(3)} ${good}` })
    );
    expect(res.status).toBe(200);
  });

  test('rejects a signature that is only present under another version', async () => {
    const p = employeeCreated();
    const ts = now();
    const id = newId();
    const res = await POST(makeRequest(p, { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1a,${sign(p, ts, id).slice(3)}` }));
    expect(res.status).toBe(401);
  });

  test('rejects missing headers', async () => {
    const res = await POST(makeRequest(employeeCreated(), {}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Missing required');
  });

  test('rejects a request with only some of the headers', async () => {
    const p = employeeCreated();
    const { 'webhook-signature': _omitted, ...partial } = signedHeaders(p);
    const res = await POST(makeRequest(p, partial));
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const res = await POST(makeRequest(employeeCreated(), { 'webhook-id': newId(), 'webhook-timestamp': now(), 'webhook-signature': 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a tampered body', async () => {
    const h = signedHeaders(employeeCreated());
    const res = await POST(makeRequest(employeeCreated(), h));
    expect(res.status).toBe(401);
  });

  test.each(['0', '-5', '1.5', '+5', '012', '1e9', 'abc'])('rejects timestamp %j that is not a plain positive integer', async (ts) => {
    const p = employeeCreated();
    const res = await POST(makeRequest(p, signedHeaders(p, ts)));
    expect(res.status).toBe(401);
  });

  test('accepts an old timestamp by default (retries and replays keep the original)', async () => {
    const old = (Math.floor(Date.now() / 1000) - 3600).toString();
    const p = employeeCreated();
    const res = await POST(makeRequest(p, signedHeaders(p, old)));
    expect(res.status).toBe(200);
  });

  test('rejects an old timestamp when BINDBEE_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
    process.env.BINDBEE_WEBHOOK_TOLERANCE_SECONDS = '300';
    try {
      const old = (Math.floor(Date.now() / 1000) - 3600).toString();
      const p = employeeCreated();
      const res = await POST(makeRequest(p, signedHeaders(p, old)));
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('Timestamp too old');
      const fresh = employeeCreated();
      expect((await POST(makeRequest(fresh, signedHeaders(fresh)))).status).toBe(200);
    } finally {
      delete process.env.BINDBEE_WEBHOOK_TOLERANCE_SECONDS;
    }
  });

  test('treats a non-numeric BINDBEE_WEBHOOK_TOLERANCE_SECONDS as 0 (check off)', async () => {
    process.env.BINDBEE_WEBHOOK_TOLERANCE_SECONDS = 'five minutes';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = (Math.floor(Date.now() / 1000) - 3600).toString();
      const p = employeeCreated();
      const res = await POST(makeRequest(p, signedHeaders(p, old)));
      expect(res.status).toBe(200);
    } finally {
      delete process.env.BINDBEE_WEBHOOK_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });

  test('fails closed when the secret is not set', async () => {
    delete process.env.BINDBEE_WEBHOOK_SECRET;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const p = employeeCreated();
      const res = await POST(makeRequest(p, signedHeaders(p)));
      expect(res.status).toBe(500);
    } finally {
      err.mockRestore();
    }
  });

  test('rejects a signed body that is not JSON', async () => {
    const p = 'not json';
    const res = await POST(makeRequest(p, signedHeaders(p)));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON');
  });

  test('answers the dashboard HEAD check with 200', async () => {
    const res = await HEAD();
    expect(res.status).toBe(200);
  });
});
