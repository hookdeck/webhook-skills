import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import crypto from 'crypto';

const secret = 'test_plain_hmac_secret';

beforeAll(() => {
  process.env.PLAIN_WEBHOOK_SECRET = secret;
});

afterEach(() => {
  delete process.env.PLAIN_TOLERANCE_SECONDS;
});

/** hex(HMAC-SHA256(secret, rawBody)) - what Plain sends in Plain-Request-Signature */
function sign(payload: string, key: string = secret): string {
  return crypto.createHmac('sha256', key).update(payload, 'utf8').digest('hex');
}

function makeEvent(
  eventType: string,
  extra: Record<string, unknown> = {},
  attemptTimestamp: string = new Date().toISOString()
): string {
  return JSON.stringify({
    id: 'e_01HD44FHMCDSSWE38N14FSYV6K',
    type: eventType,
    timestamp: '2023-10-19T14:12:25.266Z',
    workspaceId: 'w_01GST0W989ZNAW53X6XYHAY87P',
    payload: { eventType, ...extra },
    webhookMetadata: {
      webhookTargetId: 'wt_01',
      webhookTargetVersion: '2023-10-15',
      webhookDeliveryAttemptId: 'wda_01',
      webhookDeliveryAttemptNumber: 1,
      webhookDeliveryAttemptTimestamp: attemptTimestamp,
    },
  });
}

async function post(body: string, signature?: string, contentType = 'application/json') {
  const { POST } = await import('../app/webhooks/plain/route');
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['plain-request-signature'] = signature;
  const req = new Request('http://localhost/webhooks/plain', { method: 'POST', headers, body });
  return POST(req as any);
}

describe('Plain Webhook Route', () => {
  it.each([
    ['thread.thread_created', { thread: { id: 'th_01' } }],
    ['thread.email_received', { email: { id: 'em_01' } }],
    ['thread.thread_status_transitioned', { thread: { id: 'th_01' } }],
    ['customer.customer_created', { customer: { id: 'c_01' } }],
    ['thread.note_created', { note: { id: 'n_01' } }],
  ])('accepts a validly signed %s event', async (eventType, extra) => {
    const body = makeEvent(eventType, extra);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies the raw body for any content type', async () => {
    const body = makeEvent('thread.thread_created');
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    const body = makeEvent('thread.thread_created');
    const res = await post(body, sign(body).toUpperCase());
    expect(res.status).toBe(200);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await post(makeEvent('thread.thread_created'));
    expect(res.status).toBe(400);
  });

  it('returns 401 for a wrong signature', async () => {
    const res = await post(makeEvent('thread.thread_created'), 'a'.repeat(64));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a signature made with the wrong secret', async () => {
    const body = makeEvent('thread.thread_created');
    const res = await post(body, sign(body, 'other_secret'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the body was modified after signing', async () => {
    const body = makeEvent('thread.thread_created');
    const res = await post(body + ' ', sign(body));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a signature of the wrong length', async () => {
    const body = makeEvent('thread.thread_created');
    const res = await post(body, sign(body).slice(0, 62));
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-hex 64-char signatures (no truncating hex decode)', async () => {
    const body = makeEvent('thread.thread_created');
    const res = await post(body, 'zz' + sign(body).slice(2));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a signature with a trailing non-hex suffix', async () => {
    const body = makeEvent('thread.thread_created');
    const res = await post(body, sign(body) + 'zz');
    expect(res.status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });

  it('ignores stale timestamps by default (Hookdeck replays are valid)', async () => {
    const body = makeEvent('thread.thread_created', {}, '2020-01-01T00:00:00.000Z');
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('rejects stale timestamps when PLAIN_TOLERANCE_SECONDS is set', async () => {
    process.env.PLAIN_TOLERANCE_SECONDS = '300';
    const body = makeEvent('thread.thread_created', {}, '2020-01-01T00:00:00.000Z');
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });

  it('accepts fresh timestamps when PLAIN_TOLERANCE_SECONDS is set', async () => {
    process.env.PLAIN_TOLERANCE_SECONDS = '300';
    const body = makeEvent('thread.thread_created');
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });
});
