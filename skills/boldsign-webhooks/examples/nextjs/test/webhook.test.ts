import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// BoldSign signing secrets are opaque strings; this one is only for tests
const SECRET = 'test_boldsign_secret_5f0c1a7e';
const OLD_SECRET = 'old_boldsign_secret_9d2b4c8f';

let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.BOLDSIGN_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/boldsign/route'));
});

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  delete process.env.BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS;
  process.env.BOLDSIGN_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const now = () => Math.floor(Date.now() / 1000);

// Matches BoldSign's header format, including the space after the comma
function sign(
  body: string,
  { timestamp = now(), secret = SECRET, oldSecret }: { timestamp?: number; secret?: string; oldSecret?: string } = {}
): string {
  const hmac = (key: string) => crypto.createHmac('sha256', key).update(`${timestamp}.${body}`).digest('hex');
  let header = `t=${timestamp}, s0=${hmac(secret)}`;
  if (oldSecret) header += `, s1=${hmac(oldSecret)}`;
  return header;
}

function event(eventType: string): string {
  return JSON.stringify({
    event: { id: 'afceddb1-2eed-4301-ae14-8b96a6b0393a', created: 1669959514, eventType, environment: 'Test' },
    data: { object: 'document', documentId: '26b8695f-46d0-4cd4-ba1a-c5a0d595c849', messageTitle: 'NDA' },
  });
}

function post(body: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/boldsign', {
      method: 'POST',
      headers: { 'content-type': contentType, ...headers },
      body,
    })
  );
}

describe('BoldSign webhook signature verification', () => {
  it('accepts a valid s0 signature', async () => {
    const body = event('Signed');
    const res = await post(body, { 'x-boldsign-event': 'Signed', 'x-boldsign-signature': sign(body) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a match on s1 during key rollover', async () => {
    const body = event('Completed');
    const header = sign(body, { secret: 'some_other_current_key', oldSecret: SECRET });
    const res = await post(body, { 'x-boldsign-signature': header });
    expect(res.status).toBe(200);
  });

  it('accepts a match on s0 when s1 is present and stale', async () => {
    const body = event('Completed');
    const res = await post(body, { 'x-boldsign-signature': sign(body, { oldSecret: OLD_SECRET }) });
    expect(res.status).toBe(200);
  });

  it('accepts any content type', async () => {
    const body = event('Viewed');
    const res = await post(body, { 'x-boldsign-signature': sign(body) }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = event('Signed');
    const res = await post(body, { 'x-boldsign-signature': sign(body, { secret: 'wrong_secret' }) });
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const res = await post(event('Declined'), { 'x-boldsign-signature': sign(event('Signed')) });
    expect(res.status).toBe(400);
  });

  it('rejects a tampered timestamp', async () => {
    const body = event('Signed');
    const header = sign(body).replace(/t=\d+/, `t=${now() + 1}`);
    const res = await post(body, { 'x-boldsign-signature': header });
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(event('Signed'));
    expect(res.status).toBe(400);
  });

  it.each(['garbage', 't=abc, s0=deadbeef', 't=123', 's0=deadbeef', 't=123, s0=short'])(
    'rejects malformed header %j without throwing',
    async (header) => {
      const res = await post(event('Signed'), { 'x-boldsign-signature': header });
      expect(res.status).toBe(400);
    }
  );

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.BOLDSIGN_WEBHOOK_SECRET;
    const body = event('Signed');
    const res = await post(body, { 'x-boldsign-signature': sign(body) });
    expect(res.status).toBe(500);
  });
});

describe('BoldSign timestamp tolerance (opt-in)', () => {
  const old = now() - 3600;

  it('is off by default: an hour-old timestamp with a valid signature is accepted', async () => {
    const body = event('Signed');
    const res = await post(body, { 'x-boldsign-signature': sign(body, { timestamp: old }) });
    expect(res.status).toBe(200);
  });

  it('rejects old timestamps when BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS is positive', async () => {
    process.env.BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS = '300';
    const body = event('Signed');
    const res = await post(body, { 'x-boldsign-signature': sign(body, { timestamp: old }) });
    expect(res.status).toBe(400);
  });

  it('accepts fresh timestamps when the tolerance is set', async () => {
    process.env.BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS = '300';
    const body = event('Signed');
    const res = await post(body, { 'x-boldsign-signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('treats a non-numeric value as off', async () => {
    process.env.BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const body = event('Signed');
    const res = await post(body, { 'x-boldsign-signature': sign(body, { timestamp: old }) });
    expect(res.status).toBe(200);
  });
});

describe('BoldSign verification event', () => {
  it('returns 200 for the setup Verification POST without a signature', async () => {
    const res = await post(event('Verification'), { 'x-boldsign-event': 'Verification' });
    expect(res.status).toBe(200);
  });

  it('returns 200 for Verification even if no secret is configured yet', async () => {
    delete process.env.BOLDSIGN_WEBHOOK_SECRET;
    const res = await post(event('Verification'), { 'x-boldsign-event': 'Verification' });
    expect(res.status).toBe(200);
  });
});

describe('BoldSign event handling', () => {
  it.each(['Sent', 'Viewed', 'Signed', 'Completed', 'Declined', 'Revoked', 'Expired'])('handles %s', async (eventType) => {
    const body = event(eventType);
    const res = await post(body, { 'x-boldsign-event': eventType, 'x-boldsign-signature': sign(body) });
    expect(res.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
  });

  it('acknowledges unhandled events', async () => {
    const body = event('TemplateCreated');
    const res = await post(body, { 'x-boldsign-signature': sign(body) });
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled event: TemplateCreated');
  });

  it('rejects a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, { 'x-boldsign-signature': sign(body) });
    expect(res.status).toBe(400);
  });
});
